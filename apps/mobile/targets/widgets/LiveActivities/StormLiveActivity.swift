import ActivityKit
import SwiftUI
import WidgetKit

/// The storm Live Activity: a weather watch over the trip, with how serious it is, the hours it
/// covers, what it is, and the one thing to do about it. Once the window has passed it reads all
/// clear. Tapping opens the app.
struct StormLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: StormActivityAttributes.self) { context in
            StormLockScreen(state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let state = context.state
            let tint = StormLockScreen.tint(state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    StormEyebrow(state: state)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    StormWindow(state: state)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    StormBody(state: state, headlineSize: 17)
                        .padding(.horizontal, 10)
                }
            } compactLeading: {
                Image(systemName: StormLockScreen.symbol(state))
                    .foregroundStyle(tint)
            } compactTrailing: {
                Text(state.windowStart.laDate, format: .dateTime.hour().minute())
                    .font(.system(size: 13, weight: .heavy).monospacedDigit())
                    .foregroundStyle(tint)
            } minimal: {
                Image(systemName: StormLockScreen.symbol(state))
                    .foregroundStyle(tint)
            }
            .keylineTint(tint)
        }
    }
}

struct StormLockScreen: View {
    let state: StormActivityAttributes.ContentState

    static func tint(_ state: StormActivityAttributes.ContentState) -> Color {
        if state.state == .passed { return LAPalette.green }
        switch state.severity {
        case .advisory: return LAPalette.yellow
        case .watch: return LAPalette.orange
        case .warning: return LAPalette.red
        }
    }

    static func symbol(_ state: StormActivityAttributes.ContentState) -> String {
        state.state == .passed ? "sun.max.fill" : "cloud.bolt.rain.fill"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: Self.symbol(state))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Self.tint(state))
                    .accessibilityHidden(true)
                StormEyebrow(state: state)
                LAPill(tier: .free)
                Spacer(minLength: 6)
                StormWindow(state: state)
            }
            StormBody(state: state, headlineSize: 22)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

struct StormEyebrow: View {
    let state: StormActivityAttributes.ContentState

    var body: some View {
        LAEyebrow(text: Text(line), tint: StormLockScreen.tint(state))
    }

    private var line: LocalizedStringResource {
        if state.state == .passed { return "ALL CLEAR" }
        switch state.severity {
        case .advisory: return "WEATHER ADVISORY"
        case .watch: return "WEATHER WATCH"
        case .warning: return "STORM WARNING"
        }
    }
}

/// The hours the watch covers: "14:00–20:00".
struct StormWindow: View {
    let state: StormActivityAttributes.ContentState

    var body: some View {
        Text(state.windowStart.laDate...max(state.windowStart.laDate, state.windowEnd.laDate))
            .font(.system(size: 11, weight: .semibold).monospacedDigit())
            .foregroundStyle(LAPalette.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

struct StormBody: View {
    let state: StormActivityAttributes.ContentState
    let headlineSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(state.headline.uppercased())
                .font(.system(size: headlineSize, weight: .black))
                .foregroundStyle(LAPalette.paper)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            Text(state.actionLine)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(LAPalette.muted)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
