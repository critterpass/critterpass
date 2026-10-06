import Foundation

/// A widget push (`aps.content-changed`, docs/api-contracts-async.md §3.1) only makes WidgetKit
/// reload the timelines; the news is on the server. Before a widget reads the App Group snapshot,
/// it fetches `GET /v1/widgets/snapshot` with the device action key when the copy it has is not
/// fresh, and keeps whatever the server answered that it can read.
enum WidgetSnapshotRefresh {
    /// A snapshot this young was just written (by the app or another widget): no fetch.
    static let freshFor: TimeInterval = 120

    static func needsFetch(current: WidgetSnapshotFile?, now: Date) -> Bool {
        guard let current else { return true }
        return now.timeIntervalSince(current.generatedAt) > freshFor
    }

    /// Keeps a 200 body this build can read (written whole, temp file renamed over the old one);
    /// a 304, an error or a snapshot from another schema leaves the old copy. True when written.
    @discardableResult
    static func store(statusCode: Int, body: Data, root: URL?) -> Bool {
        guard statusCode == 200, let root, WidgetSnapshotFile.decode(body) != nil else { return false }
        return (try? AppGroupFileWriter.write(body, to: root.appendingPathComponent(WidgetSnapshotFile.relativePath))) != nil
    }
}

/// The widget extension's push token (`WidgetPushHandler`), left in the App Group for the app to
/// register with `register_widget_token`: the extension has no session of its own.
/// `{"schema": 1, "generated_at": ISO, "token": "<hex>"}` at `state/widget-push.json`.
struct WidgetPushTokenFile: Codable, Equatable, Sendable {
    static let relativePath = "state/widget-push.json"
    static let schemaVersion = 1

    let schema: Int
    let generatedAt: String
    let token: String

    enum CodingKeys: String, CodingKey {
        case schema
        case generatedAt = "generated_at"
        case token
    }

    init(token: Data, now: Date) {
        schema = Self.schemaVersion
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        generatedAt = formatter.string(from: now)
        self.token = token.map { String(format: "%02x", $0) }.joined()
    }

    func write(root: URL?) throws {
        guard let root else { throw CocoaError(.fileNoSuchFile) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try AppGroupFileWriter.write(
            try encoder.encode(self), to: root.appendingPathComponent(Self.relativePath))
    }

    static func read(root: URL?) -> WidgetPushTokenFile? {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath)),
              let file = try? JSONDecoder().decode(WidgetPushTokenFile.self, from: data),
              file.schema == schemaVersion
        else { return nil }
        return file
    }
}

/// Whole-file App Group writes: a temp file beside the target, renamed over it, so a reader in
/// another process never sees half a file.
enum AppGroupFileWriter {
    static func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let temp = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp)
            guard rename(temp.path, url.path) == 0 else { throw POSIXError(.EIO) }
        } catch {
            try? FileManager.default.removeItem(at: temp)
            throw error
        }
    }
}
