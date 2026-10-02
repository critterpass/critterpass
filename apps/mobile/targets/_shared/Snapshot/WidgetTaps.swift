import Foundation

/// Taps on the trip widgets that the snapshot does not show yet (`state/widgets/taps.json`): a
/// Today item done or nudged, a packing item ticked, a nudge sent from Balances. The widget shows
/// each at once; the queued command reaches the server when the app drains its outbox, and the
/// next snapshot carries the real state.
struct WidgetTaps: Codable, Equatable, Sendable {
    static let relativePath = "state/widgets/taps.json"
    /// Older than this, a tap is assumed lost and no longer shown.
    static let shownFor: TimeInterval = 6 * 3600

    var acted: [String: Date]

    static func packing(_ itemId: String) -> String { "pack:\(itemId)" }
    static func nudge(_ userId: String) -> String { "nudge:\(userId)" }

    /// Keys still within their window.
    func ids(at now: Date) -> Set<String> {
        Set(acted.filter { now.timeIntervalSince($0.value) < Self.shownFor }.keys)
    }

    static func read(root: URL?) -> WidgetTaps {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath)),
              let file = try? decoder.decode(WidgetTaps.self, from: data)
        else { return WidgetTaps(acted: [:]) }
        return file
    }

    /// Records one tap (a briefing item id, or a `packing` / `nudge` key), dropping old ones.
    static func record(key itemId: String, at now: Date, root: URL?) throws {
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
