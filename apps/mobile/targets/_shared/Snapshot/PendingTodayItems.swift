import Foundation

/// Today items acted on from the Today widget that the snapshot does not show as finished yet
/// (`state/widgets/today-acted.json`): the widget strikes them through at once, the queued
/// `act_briefing_item` reaches the server when the app drains its outbox, and the next snapshot
/// carries the real state.
struct PendingTodayItems: Codable, Equatable, Sendable {
    static let relativePath = "state/widgets/today-acted.json"
    /// Older than this, a tap is assumed lost and no longer shown.
    static let shownFor: TimeInterval = 6 * 3600

    var acted: [String: Date]

    /// Item ids still within their window.
    func ids(at now: Date) -> Set<String> {
        Set(acted.filter { now.timeIntervalSince($0.value) < Self.shownFor }.keys)
    }

    static func read(root: URL?) -> PendingTodayItems {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath)),
              let file = try? decoder.decode(PendingTodayItems.self, from: data)
        else { return PendingTodayItems(acted: [:]) }
        return file
    }

    /// Records one tap, dropping taps past their window.
    static func record(itemId: String, at now: Date, root: URL?) throws {
        guard let root else { return }
        var file = read(root: root)
        file.acted = file.acted.filter { now.timeIntervalSince($0.value) < shownFor }
        file.acted[itemId] = now
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder.encode(file).write(to: url, options: .atomic)
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
