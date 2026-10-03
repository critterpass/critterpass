import Foundation

/// A vote tapped on the vote widget that the snapshot does not have yet
/// (`state/widgets/vote-pending.json`): the widget counts it at once, the queued `cast_ballot`
/// reaches the server when the app drains its outbox, and the next snapshot replaces it.
struct PendingVote: Codable, Equatable, Sendable {
    static let relativePath = "state/widgets/vote-pending.json"
    /// Older than this, the tap is assumed lost and no longer shown.
    static let shownFor: TimeInterval = 6 * 3600

    let pollId: String
    let optionId: String
    let at: Date

    enum CodingKeys: String, CodingKey {
        case pollId = "poll_id"
        case optionId = "option_id"
        case at
    }

    static func read(root: URL?, now: Date = Date()) -> PendingVote? {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath)),
              let vote = try? decoder.decode(PendingVote.self, from: data),
              now.timeIntervalSince(vote.at) < shownFor
        else { return nil }
        return vote
    }

    func write(root: URL?) throws {
        guard let root else { return }
        let url = root.appendingPathComponent(Self.relativePath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Self.encoder.encode(self).write(to: url, options: .atomic)
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        return encoder
    }
}
