import Foundation

/// The App Group container's JSON files (api-contracts-async.md §6), shared by the app and its
/// extensions. Every write goes through `NSFileCoordinator`, so a widget or intent appending to
/// the outbox and the app draining it never interleave, and lands atomically (a temp file in the
/// same directory renamed over the target), so a reader never sees a half-written file.
/// Foundation only: extension targets can compile this file as-is.
public struct AppGroupStore: Sendable {
  public static let groupIdentifier = "group.app.critterpass"
  public static let pendingActionsPath = "state/pending-actions.json"
  public static let endpointsPath = "config/endpoints.json"

  public let root: URL
  private let now: @Sendable () -> Date

  public init(root: URL, now: @escaping @Sendable () -> Date = { Date() }) {
    self.root = root
    self.now = now
  }

  /// The store over the shared container, or nil when the App Group entitlement is missing.
  public static func shared() -> AppGroupStore? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier)
      .map { AppGroupStore(root: $0) }
  }

  // MARK: Files

  public func write(_ data: Data, to relativePath: String) throws {
    try coordinatedWrite(relativePath) { url in try Self.replaceAtomically(url, with: data) }
  }

  public func read(_ relativePath: String) throws -> Data? {
    let url = root.appendingPathComponent(relativePath)
    var coordinationError: NSError?
    var result: Result<Data?, Error> = .success(nil)
    NSFileCoordinator(filePresenter: nil).coordinate(
      readingItemAt: url, options: [], error: &coordinationError
    ) { url in
      result = Result {
        FileManager.default.fileExists(atPath: url.path) ? try Data(contentsOf: url) : nil
      }
    }
    if let coordinationError { throw coordinationError }
    return try result.get()
  }

  // MARK: Pending actions (`state/pending-actions.json`)

  /// Queues one command. Extensions call this when `POST /v1/actions` is unreachable.
  public func appendPendingAction(_ action: PendingAction) throws {
    let entry = try JSONSerialization.jsonObject(with: JSONEncoder().encode(action))
    try updatePendingActions { actions in actions + [entry] }
  }

  /// The raw file, or an empty one when nothing was ever queued.
  public func pendingActionsText() throws -> String {
    if let data = try read(Self.pendingActionsPath), let text = String(data: data, encoding: .utf8) {
      return text
    }
    return String(decoding: try Self.encode(emptyFile()), as: UTF8.self)
  }

  /// Removes the entries whose `op_id` is listed (and any entry with no `op_id` at all, which can
  /// never be addressed). Anything appended since the caller read the file stays. Returns how many
  /// entries remain.
  @discardableResult
  public func removePendingActions(opIds: Set<String>) throws -> Int {
    var remaining = 0
    try updatePendingActions { actions in
      let kept = actions.filter { entry in
        guard let opId = (entry as? [String: Any])?["op_id"] as? String else { return false }
        return !opIds.contains(opId)
      }
      remaining = kept.count
      return kept
    }
    return remaining
  }

  /// Account switch: nothing the previous user queued may be sent as the next one.
  public func clearPendingActions() throws {
    try updatePendingActions { _ in [] }
  }

  // MARK: Internals

  /// Read-modify-write of the outbox under one coordinated write. A file written by a newer
  /// schema is left untouched rather than rewritten in a shape its writer did not expect.
  private func updatePendingActions(_ change: ([Any]) throws -> [Any]) throws {
    try coordinatedWrite(Self.pendingActionsPath) { url in
      var file = emptyFile()
      if FileManager.default.fileExists(atPath: url.path) {
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let existing = object as? [String: Any],
          existing["schema"] as? Int == PendingActionsFile.schemaValue
        else {
          throw AppGroupStoreError.unsupportedSchema(Self.pendingActionsPath)
        }
        file = existing
      }
      file["actions"] = try change(file["actions"] as? [Any] ?? [])
      file["generated_at"] = Self.timestamp(now())
      try Self.replaceAtomically(url, with: Self.encode(file))
    }
  }

  private func emptyFile() -> [String: Any] {
    ["schema": PendingActionsFile.schemaValue, "generated_at": Self.timestamp(now()), "actions": []]
  }

  private func coordinatedWrite(_ relativePath: String, _ body: (URL) throws -> Void) throws {
    let url = root.appendingPathComponent(relativePath)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    var coordinationError: NSError?
    var result: Result<Void, Error> = .success(())
    NSFileCoordinator(filePresenter: nil).coordinate(
      writingItemAt: url, options: .forReplacing, error: &coordinationError
    ) { url in
      result = Result { try body(url) }
    }
    if let coordinationError { throw coordinationError }
    try result.get()
  }

  private static func replaceAtomically(_ url: URL, with data: Data) throws {
    let temp = url.deletingLastPathComponent()
      .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
    do {
      try data.write(to: temp)
      guard rename(temp.path, url.path) == 0 else {
        throw AppGroupStoreError.writeFailed(url.lastPathComponent, errno)
      }
    } catch {
      try? FileManager.default.removeItem(at: temp)
      throw error
    }
  }

  private static func encode(_ object: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
  }

  static func timestamp(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}

public enum AppGroupStoreError: Error, CustomStringConvertible, Equatable {
  case unsupportedSchema(String)
  case writeFailed(String, Int32)

  public var description: String {
    switch self {
    case .unsupportedSchema(let path): return "\(path) was written with an unsupported schema"
    case .writeFailed(let path, let code): return "replacing \(path) failed (errno \(code))"
    }
  }
}
