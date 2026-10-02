import Foundation

/// The widget snapshot as the widgets read it from the App Group (`snapshot/widgets.json`,
/// docs/api-contracts-async.md §6), with what every widget needs on top of the generated type:
/// whether it is there at all, how old it is, and its timestamps as dates.
struct WidgetSnapshotFile: Sendable {
    static let relativePath = "snapshot/widgets.json"
    /// Every schema version this build's widgets understand.
    static let supportedSchemas = 1...1
    /// Older than this, a widget says when it was last updated.
    static let staleAfter: TimeInterval = 6 * 3600

    let snapshot: WidgetSnapshot
    let generatedAt: Date

    /// The snapshot in the App Group (`root` is `AppGroupContainer.url`), or nil when there is
    /// none yet, it is from a schema this build cannot read, or it is unreadable.
    static func read(root: URL?) -> WidgetSnapshotFile? {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath))
        else { return nil }
        return decode(data)
    }

    static func decode(_ data: Data) -> WidgetSnapshotFile? {
        // Decoded directly rather than through `SnapshotDecoder`: the server writes instants with
        // milliseconds, which `JSONDecoder`'s ISO 8601 date strategy does not read.
        guard
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
            supportedSchemas.contains(snapshot.schema),
            let generatedAt = WidgetDate.parse(snapshot.generatedAt)
        else { return nil }
        return WidgetSnapshotFile(snapshot: snapshot, generatedAt: generatedAt)
    }

    func isStale(at now: Date) -> Bool {
        now.timeIntervalSince(generatedAt) > Self.staleAfter
    }

    /// The widget's perk is missing: it shows its locked state and offer instead of data.
    func isLocked(_ widget: String) -> Bool {
        snapshot.locked.contains(widget)
    }
}

/// The snapshot's instants (ISO 8601, with or without fractional seconds) and local dates.
enum WidgetDate {
    static func parse(_ text: String?) -> Date? {
        guard let text else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        return ISO8601DateFormatter().date(from: text)
    }
}
