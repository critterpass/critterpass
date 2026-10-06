import Foundation

/// I'M UP on a locked phone fills the member's own pip at once, before the server has the
/// command. Until the server's next frame shows the pip up, the pip reads "sending": the tap is
/// queued (offline, or waiting for the app to drain the outbox), not lost.
///
/// The tap leaves a mark in `state/la/<activity_id>.json` (docs/api-contracts-async.md §6): the
/// member's pip hash and the frame number the phone filled it on. The activity's view reads it.
struct LeaveBySendingMark: Codable, Equatable, Sendable {
    static let schemaVersion = 1
    /// Past this a pip the server still shows empty is no longer drawn as sending.
    static let patience: TimeInterval = 30 * 60

    let uidHash: String
    /// The frame (`seq`) the phone filled the pip on; the server's next frame is newer.
    let seq: Int
    let at: Date

    enum CodingKeys: String, CodingKey {
        case uidHash = "uid_hash"
        case seq
        case at
    }

    static func relativePath(activityId: String) -> String {
        "state/la/\(activityId).json"
    }

    /// The pip to draw as sending, if any: the marked member's, while the frame is the phone's
    /// own fill (or older), or a newer server frame still shows it empty and the tap is recent.
    func sendingPip(hashes: [String], ups: [Bool], seq frameSeq: Int, now: Date) -> Int? {
        guard let index = hashes.firstIndex(of: uidHash), index < ups.count else { return nil }
        if frameSeq <= seq { return index }
        if !ups[index], now.timeIntervalSince(at) < Self.patience { return index }
        return nil
    }

    /// The pip I'M UP fills on this phone: the member's own, unless the frame already shows it up.
    static func pipToFill(hashes: [String], ups: [Bool], mine: String) -> Int? {
        guard let index = hashes.firstIndex(of: mine), index < ups.count, !ups[index] else {
            return nil
        }
        return index
    }

    /// Written whole through a temp file renamed over the target, like every App Group file.
    func write(activityId: String, root: URL?, now: Date = Date()) throws {
        guard let root else { throw LeaveBySendingMarkError.noAppGroupContainer }
        let url = root.appendingPathComponent(Self.relativePath(activityId: activityId))
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(Envelope(schema: Self.schemaVersion, generatedAt: now, mark: self))
        let temp = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp)
            guard rename(temp.path, url.path) == 0 else {
                throw LeaveBySendingMarkError.writeFailed(errno)
            }
        } catch {
            try? FileManager.default.removeItem(at: temp)
            throw error
        }
    }

    /// The mark for this activity, or nil when there is none or it is from another schema.
    static func read(activityId: String, root: URL?) -> LeaveBySendingMark? {
        guard let root,
              let data = try? Data(
                contentsOf: root.appendingPathComponent(relativePath(activityId: activityId)))
        else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let envelope = try? decoder.decode(Envelope.self, from: data),
              envelope.schema == schemaVersion
        else { return nil }
        return envelope.mark
    }

    private struct Envelope: Codable {
        let schema: Int
        let generatedAt: Date
        let mark: LeaveBySendingMark

        enum CodingKeys: String, CodingKey {
            case schema
            case generatedAt = "generated_at"
            case mark = "pending_up"
        }
    }
}

enum LeaveBySendingMarkError: Error, Sendable, Equatable {
    case noAppGroupContainer
    case writeFailed(Int32)
}
