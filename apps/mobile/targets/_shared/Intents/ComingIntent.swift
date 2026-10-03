internal import AppIntents
import ActivityKit
import Foundation

/// I'M GOING on a crewmate's SOS activity (api-contracts-async.md §4): queues
/// `respond_sos{coming}` and shows it at once on this phone's activity; the server's next frame
/// carries the real count to everyone.
struct ComingIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "I'm going"
    static let description = IntentDescription("Tells your crewmate you are on your way to help.")

    @Parameter(title: "SOS ID")
    var sosId: String

    init() {
        sosId = ""
    }

    init(sosId: String) {
        self.sosId = sosId
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(.coming(sosId: sosId), root: AppGroupContainer.url)
        for activity in Activity<SOSActivityAttributes>.activities
        where activity.attributes.sosId == sosId && activity.content.state.state == .open {
            var state = activity.content.state
            state.state = .responding
            state.responders += 1
            await activity.update(ActivityContent(state: state, staleDate: activity.content.staleDate))
        }
        return .result()
    }
}
