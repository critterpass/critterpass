import SwiftUI
import WidgetKit

/// Every widget and Live Activity the extension draws. Live Activities live under
/// LiveActivities/ (one per kind); home and lock screen widgets append here.
@main
struct CPWidgetBundle: WidgetBundle {
    var body: some Widget {
        LeaveByStatusWidget()
        LeaveByLiveActivityWidget()
        FlightLiveActivityWidget()
        LeaveByAlarmCountdownWidget()
        MeetUpLiveActivityWidget()
        CritterNearbyLiveActivityWidget()
        VoteLiveActivityWidget()
        StormLiveActivityWidget()
        SOSLiveActivityWidget()
        RideLiveActivityWidget()
    }
}

// MARK: - Static widget (home screen / lock screen)

/// Written by the JS-side `cp-app-group` module's `writeSnapshot("hello", ...)` call — reading it
/// here is the cross-process half of the T8 round-trip proof (the write half is timed in JS).
private struct HelloSnapshotPayload: Decodable {
    let message: String
}

struct LeaveByStatusEntry: TimelineEntry {
    let date: Date
    let message: String
}

struct LeaveByStatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> LeaveByStatusEntry {
        LeaveByStatusEntry(date: Date(), message: "Critterpass spike widget")
    }

    func getSnapshot(in context: Context, completion: @escaping (LeaveByStatusEntry) -> Void) {
        completion(LeaveByStatusEntry(date: Date(), message: Self.readHelloMessage()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LeaveByStatusEntry>) -> Void) {
        completion(Timeline(entries: [LeaveByStatusEntry(date: Date(), message: Self.readHelloMessage())], policy: .never))
    }

    private static func readHelloMessage() -> String {
        guard
            let containerUrl = AppGroupContainer.url,
            let data = try? Data(contentsOf: containerUrl.appendingPathComponent("snapshot/hello.json")),
            let payload = try? SnapshotDecoder.decode(HelloSnapshotPayload.self, from: data, supportedSchemas: 1...1)
        else {
            return "No snapshot yet"
        }
        return payload.message
    }
}

struct LeaveByStatusWidget: Widget {
    let kind = "LeaveByStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LeaveByStatusProvider()) { entry in
            Text(entry.message)
        }
        .configurationDisplayName("Leave-by status")
        .description("Go/no-go scaffold widget for the Apple extension targets spike.")
    }
}
