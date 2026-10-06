// `internal`, like the app target's own App Intents package (plugins/with-alarmkit.ts): Swift 6
// rejects one module imported at two access levels.
internal import AppIntents
import Foundation

/// SNOOZE on the leave-by Live Activity once it is time to go (api-contracts-async.md §4,
/// `LA LeaveBy` row): sends `snooze_leave_by` (or queues it for the app), and the server decides whether this snooze is the
/// one that knocks on the crew. A `LiveActivityIntent`, so it runs in the app's process and lives
/// in `_shared` like `ImUpIntent`.
struct SnoozeIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Snooze"
    static let description = IntentDescription("Gives you a few more minutes before you leave.")

    @Parameter(title: "Leave-by ID")
    var leaveById: String

    init() {
        leaveById = ""
    }

    init(leaveById: String) {
        self.leaveById = leaveById
    }

    func perform() async throws -> some IntentResult {
        try await SignedActionSender.deliver(.snooze(leaveById: leaveById), root: AppGroupContainer.url)
        return .result()
    }
}
