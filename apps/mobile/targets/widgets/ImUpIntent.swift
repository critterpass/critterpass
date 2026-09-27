import AppIntents
import ActivityKit
import Foundation

/// Lock-screen "I'M UP" button on the `LeaveBy` Live Activity (api-contracts-async.md §4,
/// `LA LeaveBy` row). `LiveActivityIntent` always runs in the containing app's process (never
/// the widget extension), so it can queue straight into the shared outbox that the app drains
/// into the real command client on next launch/foreground.
struct ImUpIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "I'm up"
    static var description = IntentDescription("Tells your crew you're ready to leave.")

    @Parameter(title: "Leave-by ID")
    var leaveById: String

    init() {
        leaveById = ""
    }

    init(leaveById: String) {
        self.leaveById = leaveById
    }

    func perform() async throws -> some IntentResult {
        let action = PendingAction(
            opId: UUID().uuidString,
            createdAt: Date(),
            command: "set_readiness",
            scope: "readiness",
            payload: ["leave_by_id": leaveById, "up": "true", "source": "la"]
        )
        try PendingActionsOutbox.append(action)
        return .result()
    }
}
