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
/// next launch or foreground, and fills the member's own pip at once, marked as sending until the
/// server's next frame shows it (`LeaveBySendingMark`).
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
        let root = AppGroupContainer.url
        try PendingActionsOutbox.append(.imUp(leaveById: leaveById), root: root)
        guard let uid = try? ActionKeyStore.read().userId else { return .result() }
        let mine = LAMemberHash.of(scope: leaveById, uid: uid)
        for activity in Activity<LeaveByActivityAttributes>.activities
        where activity.attributes.leaveById == leaveById {
            let content = activity.content
            guard let state = Self.filled(content.state, mine: mine) else { continue }
            try? LeaveBySendingMark(uidHash: mine, seq: state.seq, at: Date())
                .write(activityId: activity.id, root: root)
            await activity.update(ActivityContent(state: state, staleDate: content.staleDate))
        }
        return .result()
    }

    /// The frame with this member's pip filled and counted, or nil when it already is.
    static func filled(
        _ state: LeaveByActivityAttributes.ContentState, mine: String
    ) -> LeaveByActivityAttributes.ContentState? {
        guard let index = LeaveBySendingMark.pipToFill(
            hashes: state.pips.map(\.uidHash), ups: state.pips.map(\.up), mine: mine)
        else { return nil }
        var next = state
        next.pips[index].up = true
        next.upCount = min(state.total, state.upCount + 1)
        return next
    }
}
