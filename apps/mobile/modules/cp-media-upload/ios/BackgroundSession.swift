import Foundation

/// The background URLSession every photo part travels on. The system keeps transferring after the
/// app is suspended or closed; when it relaunches the app for finished transfers, recreating the
/// session with the same identifier reconnects this delegate, which records each part's ETag in
/// the store. Parts of a large file are written to their own temporary files first, because a
/// background session uploads only from a file.
final class BackgroundSession: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  static let identifier = "app.critterpass.media-upload"
  static let shared = BackgroundSession()

  let store: UploadStore
  private let partsDirectory: URL
  private let lock = NSLock()
  private var completion: (() -> Void)?
  private var listener: (@Sendable (String, [String: Any]) -> Void)?
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    configuration.sessionSendsLaunchEvents = true
    configuration.isDiscretionary = false
    configuration.allowsCellularAccess = true
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()

  override init() {
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    store = UploadStore(url: support.appendingPathComponent("media-upload/uploads.json"))
    partsDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("media-upload")
    super.init()
  }

  /// Reconnects to transfers started by an earlier launch.
  func resume() {
    _ = session
  }

  func setListener(_ listener: (@Sendable (String, [String: Any]) -> Void)?) {
    lock.lock()
    self.listener = listener
    lock.unlock()
  }

  func setBackgroundCompletion(_ handler: @escaping () -> Void) {
    lock.lock()
    completion = handler
    lock.unlock()
    resume()
  }

  /// Starts every pending part of the job.
  func start(_ job: UploadJob) throws {
    store.put(job)
    for part in job.pendingParts {
      let file = try fileFor(job: job, part: part)
      guard let url = URL(string: part.url) else {
        store.change(job.id) { $0.markFailed(part: part.partNumber, reason: "bad_url") }
        continue
      }
      var request = URLRequest(url: url)
      request.httpMethod = "PUT"
      if job.parts.count == 1 { request.setValue(job.contentType, forHTTPHeaderField: "Content-Type") }
      let task = session.uploadTask(with: request, fromFile: file)
      task.taskDescription = "\(job.id)|\(part.partNumber)"
      store.change(job.id) { queued in
        queued.update(part: part.partNumber) { started in started.state = .uploading }
      }
      task.resume()
    }
  }

  func cancel(_ id: String) {
    session.getAllTasks { tasks in
      for task in tasks where task.taskDescription?.hasPrefix("\(id)|") == true { task.cancel() }
    }
    store.remove(id)
    removePartFiles(id)
  }

  private func fileFor(job: UploadJob, part: UploadPart) throws -> URL {
    let source = URL(fileURLWithPath: job.filePath)
    if job.parts.count == 1 && part.offset == 0 { return source }
    try FileManager.default.createDirectory(at: partsDirectory, withIntermediateDirectories: true)
    let destination = partsDirectory.appendingPathComponent("\(job.id)-\(part.partNumber).part")
    let handle = try FileHandle(forReadingFrom: source)
    defer { try? handle.close() }
    try handle.seek(toOffset: UInt64(part.offset))
    let data = try handle.read(upToCount: Int(part.length)) ?? Data()
    try data.write(to: destination, options: .atomic)
    return destination
  }

  private func removePartFiles(_ id: String) {
    let files = (try? FileManager.default.contentsOfDirectory(atPath: partsDirectory.path)) ?? []
    for file in files where file.hasPrefix("\(id)-") {
      try? FileManager.default.removeItem(at: partsDirectory.appendingPathComponent(file))
    }
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    lock.lock()
    let listener = self.listener
    lock.unlock()
    listener?(name, body)
  }

  private static func parse(_ task: URLSessionTask) -> (String, Int)? {
    guard let parts = task.taskDescription?.split(separator: "|"), parts.count == 2,
      let number = Int(parts[1])
    else { return nil }
    return (String(parts[0]), number)
  }

  // MARK: URLSessionTaskDelegate

  func urlSession(
    _ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64
  ) {
    guard let parsed = Self.parse(task) else { return }
    let (id, number) = parsed
    guard
      let job = store.change(id, { job in
        job.update(part: number) { part in part.sentBytes = totalBytesSent }
      })
    else { return }
    emit("onUploadProgress", ["id": id, "sentBytes": job.sentBytes, "totalBytes": job.totalBytes])
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let parsed = Self.parse(task) else { return }
    let (id, number) = parsed
    let response = task.response as? HTTPURLResponse
    let etag = response?.value(forHTTPHeaderField: "ETag")
    let job: UploadJob?
    if error == nil, let response, (200..<300).contains(response.statusCode), let etag {
      job = store.change(id) { $0.markDone(part: number, etag: etag) }
      emit("onUploadPartDone", ["id": id, "partNumber": number, "etag": etag])
    } else {
      let reason = error.map { ($0 as NSError).code == NSURLErrorCancelled ? "cancelled" : "network" }
        ?? "http_\(response?.statusCode ?? 0)"
      job = store.change(id) { $0.markFailed(part: number, reason: reason) }
      emit("onUploadFailed", ["id": id, "partNumber": number, "reason": reason])
    }
    let partFile = partsDirectory.appendingPathComponent("\(id)-\(number).part")
    try? FileManager.default.removeItem(at: partFile)
    if job?.state == "done" { emit("onUploadFinished", ["id": id]) }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    lock.lock()
    let handler = completion
    completion = nil
    lock.unlock()
    guard let handler else { return }
    // The system's handler must run on the main queue; it is not marked Sendable.
    nonisolated(unsafe) let run = handler
    DispatchQueue.main.async { run() }
  }
}
