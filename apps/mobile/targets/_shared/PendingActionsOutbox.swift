import Foundation

/// A single queued command envelope, written by an extension or a `LiveActivityIntent` when it
/// cannot (or should not block to) call `POST /v1/actions` itself. The app drains this file on
/// next launch/foreground (api-contracts-async.md §4, §6 `state/pending-actions.json`).
struct PendingAction: Codable, Hashable, Sendable {
    let opId: String
    let createdAt: Date
    let command: String
    let scope: String
    let payload: [String: String]

    enum CodingKeys: String, CodingKey {
        case opId = "op_id"
        case createdAt = "created_at"
        case command
        case scope
        case payload
    }
}

enum PendingActionsOutboxError: Error, Sendable {
    case noAppGroupContainer
}

/// Atomic (temp file + rename) append to `state/pending-actions.json`, matching the App Group
/// contract's write rule so a half-written file is never observed by a reader.
enum PendingActionsOutbox {
    private static let schemaVersion = 1
    private static let relativePath = "state/pending-actions.json"

    static func append(_ action: PendingAction) throws {
        guard let containerUrl = AppGroupContainer.url else {
            throw PendingActionsOutboxError.noAppGroupContainer
        }
        let fileUrl = containerUrl.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: fileUrl.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        var actions = (try? read(at: fileUrl)) ?? []
        actions.append(action)

        let payload = QueuedActionsPayload(
            schema: schemaVersion,
            generatedAt: Date(),
            actions: actions
        )
        let data = try JSONEncoder.cpSnapshotEncoder.encode(payload)

        let tempUrl = fileUrl.appendingPathExtension("tmp-\(UUID().uuidString)")
        try data.write(to: tempUrl, options: .atomic)
        _ = try FileManager.default.replaceItemAt(fileUrl, withItemAt: tempUrl)
    }

    private static func read(at fileUrl: URL) throws -> [PendingAction] {
        let data = try Data(contentsOf: fileUrl)
        let payload = try SnapshotDecoder.decode(
            QueuedActionsPayload.self,
            from: data,
            supportedSchemas: schemaVersion...schemaVersion
        )
        return payload.actions
    }
}

private struct QueuedActionsPayload: Codable, Sendable {
    let schema: Int
    let generatedAt: Date
    let actions: [PendingAction]

    enum CodingKeys: String, CodingKey {
        case schema
        case generatedAt = "generated_at"
        case actions
    }
}
