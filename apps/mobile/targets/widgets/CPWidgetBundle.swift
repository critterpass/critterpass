import SwiftUI
import WidgetKit

/// Hello-world scaffold proving `@bacons/apple-targets` can generate, sign and build a widget
/// extension target containing a static widget, a Live Activity, an AlarmKit presentation and an
/// App Intent button, all under Swift 6 strict concurrency. Feature phases replace these views;
/// the target wiring (entitlements, Info.plist, embed phase) is what this scaffold proves.
@main
struct CritterpassWidgetsBundle: WidgetBundle {
    var body: some Widget {
        LeaveByStatusWidget()
        LeaveByLiveActivityWidget()
        LeaveByAlarmCountdownWidget()
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

// MARK: - Live Activity (lock screen + Dynamic Island)

struct LeaveByLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LeaveByActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 4) {
                Text(context.attributes.title)
                    .font(.headline)
                Text(context.state.guideLine)
                    .font(.caption)
                Button(intent: ImUpIntent(leaveById: context.attributes.leaveById)) {
                    Text("I'm up (\(context.state.upCount)/\(context.state.total))")
                }
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.leg)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Button(intent: ImUpIntent(leaveById: context.attributes.leaveById)) {
                        Text("I'm up")
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.walk")
            } compactTrailing: {
                Text("\(context.state.upCount)/\(context.state.total)")
            } minimal: {
                Image(systemName: "figure.walk")
            }
        }
    }
}
