import ExpoModulesCore
import Foundation

struct PartRecord: Record {
  @Field var partNumber: Int = 1
  @Field var url: String = ""
  @Field var offset: Double = 0
  @Field var length: Double = 0
}

struct EnqueueRecord: Record {
  @Field var id: String = ""
  @Field var filePath: String = ""
  @Field var contentType: String = "image/jpeg"
  @Field var parts: [PartRecord] = []
}

/// Background photo uploads (iOS background URLSession). JS prepares a photo (location removed),
/// presigns its parts, queues them here, and completes the upload on the server once every part
/// reports its ETag, also after a relaunch, from `getUploads()`.
public class CpMediaUploadModule: Module {
  private let relay = UploadEventRelay()

  public func definition() -> ModuleDefinition {
    let relay = self.relay
    Name("CpMediaUpload")

    Events("onUploadProgress", "onUploadPartDone", "onUploadFailed", "onUploadFinished")

    OnCreate {
      relay.module = self
      BackgroundSession.shared.resume()
    }

    OnStartObserving {
      BackgroundSession.shared.setListener(relay.sink)
    }

    OnStopObserving {
      BackgroundSession.shared.setListener(nil)
    }

    AsyncFunction("preparePhoto") { (uri: String, id: String) throws -> [String: Any] in
      let source = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
      let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("media-upload/files", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let ext = source.pathExtension.isEmpty ? "jpg" : source.pathExtension.lowercased()
      let photo = try PhotoPreparer.prepare(
        source: source, destination: directory.appendingPathComponent("\(id).\(ext)"))
      let optional: [String: Any?] = [
        "path": photo.path, "sha256": photo.sha256, "bytes": photo.bytes, "width": photo.width,
        "height": photo.height, "takenAt": photo.takenAt, "gpsStripped": photo.gpsStripped,
      ]
      return optional.compactMapValues { $0 }
    }

    AsyncFunction("enqueue") { (request: EnqueueRecord) throws in
      let job = UploadJob(
        id: request.id, filePath: request.filePath, contentType: request.contentType,
        parts: request.parts.map {
          UploadPart(
            partNumber: $0.partNumber, url: $0.url, offset: Int64($0.offset),
            length: Int64($0.length), etag: nil, state: .pending)
        }, failure: nil)
      try BackgroundSession.shared.start(job)
    }

    AsyncFunction("retry") { (id: String, urls: [String: String]) throws in
      let fresh = Dictionary(uniqueKeysWithValues: urls.compactMap { key, value in
        Int(key).map { ($0, value) }
      })
      guard let job = BackgroundSession.shared.store.change(id, { $0.retry(urls: fresh) }) else {
        return
      }
      try BackgroundSession.shared.start(job)
    }

    AsyncFunction("getUploads") { () -> [[String: Any]] in
      BackgroundSession.shared.store.all().map(Self.describe)
    }

    AsyncFunction("cancel") { (id: String) in
      BackgroundSession.shared.cancel(id)
    }

    /// Forgets a completed upload and deletes its prepared file.
    AsyncFunction("finish") { (id: String) in
      let store = BackgroundSession.shared.store
      if let job = store.job(id) { try? FileManager.default.removeItem(atPath: job.filePath) }
      store.remove(id)
    }
  }

  static func describe(_ job: UploadJob) -> [String: Any] {
    var body: [String: Any] = [
      "id": job.id, "state": job.state, "filePath": job.filePath,
      "sentBytes": job.sentBytes, "totalBytes": job.totalBytes,
      "parts": job.parts.map { part -> [String: Any] in
        var entry: [String: Any] = ["partNumber": part.partNumber, "state": part.state.rawValue]
        if let etag = part.etag { entry["etag"] = etag }
        return entry
      },
    ]
    if let failure = job.failure { body["failure"] = failure }
    return body
  }
}

/// Sends upload events from the session's delegate queue: a Sendable box around a weak module
/// reference (async function bodies and the session are Sendable; the module is not).
final class UploadEventRelay: @unchecked Sendable {
  private let lock = NSLock()
  private weak var owner: Module?

  var module: Module? {
    get { lock.withLock { owner } }
    set { lock.withLock { owner = newValue } }
  }

  var sink: @Sendable (String, [String: Any]) -> Void {
    { [self] name, body in module?.sendEvent(name, body) }
  }
}

/// Hands the system's background-session wake-up to the shared session, which calls it back once
/// every finished transfer is recorded.
public class MediaUploadAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == BackgroundSession.identifier else {
      completionHandler()
      return
    }
    BackgroundSession.shared.setBackgroundCompletion(completionHandler)
  }
}
