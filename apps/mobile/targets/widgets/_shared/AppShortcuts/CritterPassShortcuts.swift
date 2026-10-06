// `internal`, like the app target's own App Intents package (plugins/with-alarmkit.ts): Swift 6
// rejects one module imported at two access levels.
internal import AppIntents
import Foundation

// Siri and Spotlight phrases (docs/api-contracts-async.md §4, `App Shortcuts` row). The system only
// reads App Shortcuts from the app itself, which is why this folder is the widget target's
// `_shared`: it is compiled into the app as well as the widget extension.

/// "Ask Tokek": opens the guide sheet. The guide's answers are metered, so they run in the app.
struct AskGuideIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask your guide"
    static let description = IntentDescription("Opens a chat with your trip's guide.")

    func perform() async throws -> some IntentResult & OpensIntent {
        guard let url = LADeepLink.url(route: "guide/new") else { return .result() }
        return .result(opensIntent: OpenURLIntent(url))
    }
}

/// "When do we leave?": the next leave-by from the widget snapshot, read out without opening.
struct NextLeaveByIntent: AppIntent {
    static let title: LocalizedStringResource = "Next leave-by"
    static let description = IntentDescription("Tells you when your crew leaves next.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let snapshot = WidgetSnapshotFile.read(root: AppGroupContainer.url)?.snapshot
        guard let next = snapshot?.nextLeaveBy, let at = WidgetDate.parse(next.leaveAt), at > Date()
        else { return .result(dialog: "Nothing to leave for yet.") }
        let time = at.formatted(date: .omitted, time: .shortened)
        if let place = next.placeName, !place.isEmpty {
            return .result(dialog: "Leave by \(time) for \(place).")
        }
        return .result(dialog: "Leave by \(time) for \(next.title).")
    }
}

/// "Switch to the Bali Six": opens that crew, which makes it the one the app shows.
struct SetActiveCrewIntent: AppIntent {
    static let title: LocalizedStringResource = "Switch crew"
    static let description = IntentDescription("Opens one of your crews.")

    @Parameter(title: "Crew")
    var crew: CrewShortcutEntity

    init() {}

    init(crew: CrewShortcutEntity) {
        self.crew = crew
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        guard let url = LADeepLink.url(route: "crew/\(crew.id)") else { return .result() }
        return .result(opensIntent: OpenURLIntent(url))
    }
}

/// A crew as Siri lists it, from `snapshot/crews.json` (names only).
struct CrewShortcutEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Crew"
    static let defaultQuery = CrewShortcutQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct CrewShortcutQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CrewShortcutEntity] {
        Self.crews().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CrewShortcutEntity] {
        Self.crews()
    }

    /// The crews file the app writes for extensions; empty until it has.
    static func crews(root: URL? = AppGroupContainer.url) -> [CrewShortcutEntity] {
        struct File: Decodable {
            struct Crew: Decodable { let name: String }
            let crews: [String: Crew]
        }
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent("snapshot/crews.json")),
              let file = try? SnapshotDecoder.decode(File.self, from: data, supportedSchemas: 1...1)
        else { return [] }
        return file.crews.map { CrewShortcutEntity(id: $0.key, name: $0.value.name) }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

struct CritterPassShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskGuideIntent(),
            phrases: ["Ask my guide in \(.applicationName)", "Open my \(.applicationName) guide"],
            shortTitle: "Ask your guide",
            systemImageName: "bubble.left.and.text.bubble.right")
        AppShortcut(
            intent: NextLeaveByIntent(),
            phrases: ["When do we leave in \(.applicationName)", "Next leave-by in \(.applicationName)"],
            shortTitle: "Next leave-by",
            systemImageName: "alarm")
        AppShortcut(
            intent: SetActiveCrewIntent(),
            phrases: ["Switch crew in \(.applicationName)", "Open \(\.$crew) in \(.applicationName)"],
            shortTitle: "Switch crew",
            systemImageName: "person.3")
    }
}
