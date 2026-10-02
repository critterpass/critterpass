internal import AppIntents
import Foundation
import WidgetKit

/// DONE or NUDGE on a Today widget item (api-contracts-async.md §3.4 `cp.briefing`): strikes the
/// item through at once on this phone and queues `act_briefing_item` for the app to send.
struct BriefingItemIntent: AppIntent {
    static let title: LocalizedStringResource = "Today's item"
    static let description = IntentDescription("Marks an item on today's plan done, or nudges the crew.")

    @Parameter(title: "Item ID")
    var itemId: String

    /// `done` or `nudge`.
    @Parameter(title: "Action")
    var action: String

    init() {
        itemId = ""
        action = "done"
    }

    init(itemId: String, action: String) {
        self.itemId = itemId
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        let root = AppGroupContainer.url
        try PendingActionsOutbox.append(.briefing(itemId: itemId, action: action), root: root)
        try? PendingTodayItems.record(itemId: itemId, at: Date(), root: root)
        WidgetCenter.shared.reloadTimelines(ofKind: "CPTodayWidget")
        return .result()
    }
}
