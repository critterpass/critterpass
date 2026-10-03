internal import AppIntents
import Foundation
import WidgetKit

// The trip widgets' buttons (api-contracts-async.md §4 `Widget Balances`, `Widget Today`): each
// shows its tap at once on this phone (`WidgetTaps`) and queues its command in the shared outbox,
// which the app drains with its session. The server holds the rules (one nudge per pair a day).

/// NUDGE <NAME> on the Balances widget: a friendly reminder about what they owe.
struct NudgeIntent: AppIntent {
    static let title: LocalizedStringResource = "Nudge"
    static let description = IntentDescription("Sends a crewmate a friendly reminder about what they owe.")

    @Parameter(title: "Crewmate ID")
    var userId: String

    @Parameter(title: "Trip ID")
    var tripId: String

    init() {
        userId = ""
        tripId = ""
    }

    init(userId: String, tripId: String) {
        self.userId = userId
        self.tripId = tripId
    }

    func perform() async throws -> some IntentResult {
        let root = AppGroupContainer.url
        try PendingActionsOutbox.append(.paymentNudge(targetUid: userId, tripId: tripId), root: root)
        try? WidgetTaps.record(key: WidgetTaps.nudge(userId), at: Date(), root: root)
        WidgetCenter.shared.reloadTimelines(ofKind: "CPBalancesWidget")
        return .result()
    }
}

/// A packing item ticked on the Today widget.
struct PackingCheckIntent: AppIntent {
    static let title: LocalizedStringResource = "Packed"
    static let description = IntentDescription("Ticks an item off today's packing.")

    @Parameter(title: "Item ID")
    var itemId: String

    init() {
        itemId = ""
    }

    init(itemId: String) {
        self.itemId = itemId
    }

    func perform() async throws -> some IntentResult {
        let root = AppGroupContainer.url
        try PendingActionsOutbox.append(.packingCheck(itemId: itemId, checked: true), root: root)
        try? WidgetTaps.record(key: WidgetTaps.packing(itemId), at: Date(), root: root)
        WidgetCenter.shared.reloadTimelines(ofKind: "CPTodayWidget")
        return .result()
    }
}
