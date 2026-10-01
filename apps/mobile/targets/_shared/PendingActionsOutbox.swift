import Foundation

/// One command an extension or a `LiveActivityIntent` queues for the app, in exactly the entry
/// shape the app's drain accepts (`pendingActionSchema` in packages/domain/src/surfaces/app-group.ts,
/// api-contracts-async.md §4, §6): `{op_id (UUIDv7), cmd, v, via, scope, client_ts, payload}`.
/// The app adds the signed-in uid and the device, keeping this `op_id` and `via`, so a command the
/// server already applied comes back as a duplicate instead of applying twice.
struct PendingAction: Hashable, Sendable {
    /// How the surface reached the command (the envelope's `actor.via`).
    enum Via: String, Sendable {
        case widget
        case notifAction = "notif_action"
        case laIntent = "la_intent"
        case appIntent = "app_intent"
    }

    static let version = 1

    let opId: String
    let cmd: String
    let via: Via
    /// The action-key scope the surface would have used for `POST /v1/actions`.
    let scope: String
    /// When the user acted.
    let clientTs: Date
    let payload: [String: String]

    /// The JSON object written into the file's `actions` array.
    var entry: [String: Any] {
        [
            "op_id": opId,
            "cmd": cmd,
            "v": Self.version,
            "via": via.rawValue,
            "scope": scope,
            "client_ts": PendingActionsOutbox.timestamp(clientTs),
            "payload": payload,
        ]
    }

    /// "I'M UP" on the leave-by Live Activity: `set_readiness{leave_by_id, state: up, source: la}`.
    static func imUp(
        leaveById: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId,
            cmd: "set_readiness",
            via: .laIntent,
            scope: "readiness",
            clientTs: now,
            payload: ["leave_by_id": leaveById, "state": "up", "source": "la"]
        )
    }

    /// A time-ordered UUIDv7 (RFC 9562): the server only accepts v7 `op_id`s.
    static func uuidV7(now: Date = Date()) -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        let millis = UInt64(now.timeIntervalSince1970 * 1000)
        for index in 0..<6 {
            bytes[index] = UInt8(truncatingIfNeeded: millis >> (8 * (5 - index)))
        }
        for index in 6..<16 {
            bytes[index] = UInt8.random(in: 0...255)
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x70
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let groups = [(0, 8), (8, 4), (12, 4), (16, 4), (20, 12)].map { start, length in
            String(hex.dropFirst(start).prefix(length))
        }
        return groups.joined(separator: "-")
    }
}

enum PendingActionsOutboxError: Error, Sendable, Equatable {
    case noAppGroupContainer
    /// Written by a newer build: left untouched rather than rewritten in a shape it did not expect.
    case unsupportedSchema
    case writeFailed(Int32)
}

/// Appends to `state/pending-actions.json` with the same file contract as the app's own store
/// (modules/cp-app-group/ios/AppGroupStore.swift): one coordinated read-modify-write, entries other
/// writers queued kept as they are, and a temp file renamed over the target so a reader never
/// sees a half-written file.
enum PendingActionsOutbox {
    static let schemaVersion = 1
    static let relativePath = "state/pending-actions.json"

    /// `root` is the App Group container (`AppGroupContainer.url`), nil when the entitlement is missing.
    static func append(_ action: PendingAction, root: URL?, now: Date = Date()) throws {
        guard let root else { throw PendingActionsOutboxError.noAppGroupContainer }
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var coordinationError: NSError?
        var result: Result<Void, Error> = .success(())
        NSFileCoordinator(filePresenter: nil).coordinate(
            writingItemAt: url, options: .forReplacing, error: &coordinationError
        ) { url in
            result = Result { try appendLocked(action, at: url, now: now) }
        }
        if let coordinationError { throw coordinationError }
        try result.get()
    }

    static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func appendLocked(_ action: PendingAction, at url: URL, now: Date) throws {
        var file: [String: Any] = ["schema": schemaVersion, "actions": [Any]()]
        if FileManager.default.fileExists(atPath: url.path) {
            let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
            guard let existing = object as? [String: Any], existing["schema"] as? Int == schemaVersion
            else { throw PendingActionsOutboxError.unsupportedSchema }
            file = existing
        }
        file["actions"] = (file["actions"] as? [Any] ?? []) + [action.entry]
        file["generated_at"] = timestamp(now)
        let data = try JSONSerialization.data(withJSONObject: file, options: [.sortedKeys])

        let temp = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp)
            guard rename(temp.path, url.path) == 0 else {
                throw PendingActionsOutboxError.writeFailed(errno)
            }
        } catch {
            try? FileManager.default.removeItem(at: temp)
            throw error
        }
    }
}
