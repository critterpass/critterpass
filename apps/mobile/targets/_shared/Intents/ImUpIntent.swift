// `internal`, like the app target's own App Intents package (plugins/with-alarmkit.ts): Swift 6
// rejects one module imported at two access levels.
internal import AppIntents
import ActivityKit
import Foundation

/// Lock-screen "I'M UP" button on the `LeaveBy` Live Activity (api-contracts-async.md §4,
/// `LA LeaveBy` row). A `LiveActivityIntent` runs in the containing app's process, never in the
/// widget extension, so the type has to be compiled into the app as well as the extension that
/// draws the button: that is why it lives in `_shared` (every target compiles this folder). It
/// queues straight into the shared outbox, which the app drains into the real command client on
/// next launch or foreground.
struct ImUpIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "I'm up"
    static let description = IntentDescription("Tells your crew you're ready to leave.")

    @Parameter(title: "Leave-by ID")
    var leaveById: String

    init() {
        leaveById = ""
    }

    init(leaveById: String) {
        self.leaveById = leaveById
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(.imUp(leaveById: leaveById), root: AppGroupContainer.url)
        return .result()
    }
}
