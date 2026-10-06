import Foundation

/// One presigned PUT of a byte range of the file (a whole small file is one part at offset 0).
struct UploadPart: Codable, Equatable, Sendable {
  let partNumber: Int
  let url: String
  let offset: Int64
  let length: Int64
  var etag: String?
  var state: PartState
  var sentBytes: Int64 = 0
}

enum PartState: String, Codable, Sendable {
  case pending
  case uploading
  case done
  case failed
}

/// An upload the app queued: every part must land before the app completes it on the server.
struct UploadJob: Codable, Equatable, Sendable {
  let id: String
  let filePath: String
  let contentType: String
  var parts: [UploadPart]
  /// The HTTP status or transport error of the last failed part.
  var failure: String?

  var state: String {
    if parts.allSatisfy({ $0.state == .done }) { return "done" }
    if parts.contains(where: { $0.state == .failed }) { return "failed" }
    return "uploading"
  }

  var totalBytes: Int64 { parts.reduce(0) { $0 + $1.length } }
  var sentBytes: Int64 { parts.reduce(0) { $0 + ($1.state == .done ? $1.length : $1.sentBytes) } }

  /// Parts with no transfer running and no result yet: what a (re)start must send.
  var pendingParts: [UploadPart] { parts.filter { $0.state == .pending } }

  mutating func update(part number: Int, _ change: (inout UploadPart) -> Void) {
    guard let index = parts.firstIndex(where: { $0.partNumber == number }) else { return }
    change(&parts[index])
  }

  mutating func markDone(part number: Int, etag: String) {
    update(part: number) {
      $0.state = .done
      $0.etag = etag
      $0.sentBytes = $0.length
    }
  }

  mutating func markFailed(part number: Int, reason: String) {
    update(part: number) { $0.state = .failed }
    failure = reason
  }

  /// Failed parts go back to pending, with fresh URLs when the app re-presigned them.
  mutating func retry(urls: [Int: String]) {
    parts = parts.map { part in
      guard part.state == .failed || part.state == .pending else { return part }
      return UploadPart(
        partNumber: part.partNumber, url: urls[part.partNumber] ?? part.url, offset: part.offset,
        length: part.length, etag: nil, state: .pending)
    }
    failure = nil
  }
}

/// The queued uploads, kept in a JSON file so a transfer the system finishes after the app was
/// closed still finds its job. Every change is written atomically.
final class UploadStore: @unchecked Sendable {
  private let url: URL
  private let lock = NSLock()

  init(url: URL) {
    self.url = url
  }

  func all() -> [UploadJob] {
    lock.lock()
    defer { lock.unlock() }
    return read()
  }

  func job(_ id: String) -> UploadJob? {
    all().first { $0.id == id }
  }

  func put(_ job: UploadJob) {
    mutate { jobs in
      jobs.removeAll { $0.id == job.id }
      jobs.append(job)
    }
  }

  @discardableResult
  func change(_ id: String, _ change: (inout UploadJob) -> Void) -> UploadJob? {
    var changed: UploadJob?
    mutate { jobs in
      guard let index = jobs.firstIndex(where: { $0.id == id }) else { return }
      change(&jobs[index])
      changed = jobs[index]
    }
    return changed
  }

  func remove(_ id: String) {
    mutate { jobs in jobs.removeAll { $0.id == id } }
  }

  private func mutate(_ body: (inout [UploadJob]) -> Void) {
    lock.lock()
    defer { lock.unlock() }
    var jobs = read()
    body(&jobs)
    try? FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let data = try? JSONEncoder().encode(jobs) {
      try? data.write(to: url, options: .atomic)
    }
  }

  private func read() -> [UploadJob] {
    guard let data = try? Data(contentsOf: url) else { return [] }
    return (try? JSONDecoder().decode([UploadJob].self, from: data)) ?? []
  }
}
