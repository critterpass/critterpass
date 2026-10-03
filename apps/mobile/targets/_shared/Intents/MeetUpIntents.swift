// `internal`, like the app target's own App Intents package (plugins/with-alarmkit.ts): Swift 6
// rejects one module imported at two access levels.
internal import AppIntents
import ActivityKit
import Foundation

// The crew-live (meet-up) activity's buttons (api-contracts-async.md §4, `LA MeetUp` rows). Like
// `ImUpIntent`, each is a `LiveActivityIntent`, so it runs in the app's process and lives in
// `_shared`; each queues its command in the shared outbox, which the app drains at once. The
// server checks Boost and membership when the command arrives.

/// RUNNING LATE: tells the crew this member needs ten more minutes.
struct RunningLateIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Running late"
    static let description = IntentDescription("Tells your crew you need ten more minutes.")

    @Parameter(title: "Trip ID")
    var tripId: String

    @Parameter(title: "Meet-up ID")
    var meetupId: String

    init() {
        tripId = ""
        meetupId = ""
    }

    init(tripId: String, meetupId: String) {
        self.tripId = tripId
        self.meetupId = meetupId
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(
            .runningLate(tripId: tripId, meetupId: meetupId), root: AppGroupContainer.url)
        return .result()
    }
}

/// ON MY WAY: tells the crew this member has set off.
struct OnMyWayIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "On my way"
    static let description = IntentDescription("Tells your crew you have set off.")

    @Parameter(title: "Trip ID")
    var tripId: String

    init() {
        tripId = ""
    }

    init(tripId: String) {
        self.tripId = tripId
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(
            .pingAll(tripId: tripId, onMyWay: true), root: AppGroupContainer.url)
        return .result()
    }
}

/// PING ALL: asks everyone in the crew where they are.
struct PingAllIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Ping all"
    static let description = IntentDescription("Asks everyone in your crew where they are.")

    @Parameter(title: "Trip ID")
    var tripId: String

    init() {
        tripId = ""
    }

    init(tripId: String) {
        self.tripId = tripId
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(
            .pingAll(tripId: tripId, onMyWay: false), root: AppGroupContainer.url)
        return .result()
    }
}

/// SOS: never one tap. The system asks first, and only a confirmed SOS is queued.
struct SOSIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "SOS"
    static let description = IntentDescription("Sends an SOS to your crew.")

    @Parameter(title: "Trip ID")
    var tripId: String

    init() {
        tripId = ""
    }

    init(tripId: String) {
        self.tripId = tripId
    }

    func perform() async throws -> some IntentResult {
        try await requestConfirmation(
            actionName: .send,
            dialog: "Send an SOS to your whole crew? They will see where you are until you are safe."
        )
        try PendingActionsOutbox.append(.sos(tripId: tripId), root: AppGroupContainer.url)
        return .result()
    }
}
