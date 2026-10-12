import ActivityKit
import SwiftUI
import WidgetKit

/// The crew SOS Live Activity: who needs help, how many are on the way, how long since their
/// phone last reported in, and "I'm going". Where they are stays in the app, on the map behind a
/// tap. Resolved, it says so and goes.
struct SOSLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SOSActivityAttributes.self) { context in
            SOSLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(SOSLockScreen.ground(context.state))
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let state = context.state
            let tint = SOSLockScreen.tint(state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    SOSEyebrow(state: state)
                        .padding(.leading, 4)
                    .islandAppearance()
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SOSLastSeen(state: state)
                        .padding(.trailing, 4)
                    .islandAppearance()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        SOSHeadline(attributes: context.attributes, state: state, size: 18)
                        HStack(spacing: 8) {
                            SOSResponders(state: state)
                            Spacer(minLength: 4)
                            SOSGoingButton(sosId: context.attributes.sosId, state: state)
                        }
                    }
                    .padding(.horizontal, 10)
                    .islandAppearance()
                }
            } compactLeading: {
                Image(systemName: "sos")
                    .font(.system(size: 13, weight: .heavy))
                    .foregroundStyle(tint)
                    .islandAppearance()
            } compactTrailing: {
                Text("\(state.responders)")
                    .font(.system(size: 14, weight: .heavy).monospacedDigit())
                    .foregroundStyle(tint)
                    .contentTransition(.numericText())
                    .islandAppearance()
            } minimal: {
                Image(systemName: "sos")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(tint)
                    .islandAppearance()
            }
            .keylineTint(tint)
        }
    }
}

struct SOSLockScreen: View {
    let attributes: SOSActivityAttributes
    let state: SOSActivityAttributes.ContentState

    static func over(_ state: SOSActivityAttributes.ContentState) -> Bool {
        state.state == .resolved || state.state == .cancelled
    }

    static func tint(_ state: SOSActivityAttributes.ContentState) -> Color {
        over(state) ? LAPalette.green : LAPalette.red
    }

    /// A dark red ground while it is open, the usual card once it is over.
    /// The system glass once it is over; the destructive tint while someone needs the crew.
    static func ground(_ state: SOSActivityAttributes.ContentState) -> Color? {
        over(state) ? nil : LAPalette.destructiveBg
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                SOSEyebrow(state: state)
                Spacer(minLength: 6)
                SOSLastSeen(state: state)
            }
            SOSHeadline(attributes: attributes, state: state, size: 24)
            HStack(spacing: 10) {
                SOSResponders(state: state)
                Spacer(minLength: 4)
                SOSGoingButton(sosId: attributes.sosId, state: state)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

struct SOSEyebrow: View {
    let state: SOSActivityAttributes.ContentState

    var body: some View {
        LAEyebrow(text: Text(line), tint: SOSLockScreen.tint(state))
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .open, .responding: return "SOS"
        case .resolved: return "SAFE"
        case .cancelled: return "FALSE ALARM"
        }
    }
}

/// "seen 3 min ago": how long since the sender's phone last reported in.
struct SOSLastSeen: View {
    let state: SOSActivityAttributes.ContentState

    var body: some View {
        if let minutes = state.lastSeenMin, !SOSLockScreen.over(state) {
            Text(minutes == 0 ? "seen just now" : "seen \(minutes) min ago")
                .font(.system(size: 11, weight: .semibold).monospacedDigit())
                .foregroundStyle(LAPalette.muted)
                .lineLimit(1)
                .contentTransition(.numericText())
        }
    }
}

struct SOSHeadline: View {
    let attributes: SOSActivityAttributes
    let state: SOSActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        Text(line)
            .font(.system(size: size, weight: .heavy))
            .foregroundStyle(LAPalette.paper)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }

    private var line: LocalizedStringResource {
        let name = attributes.senderName
        switch state.state {
        case .open, .responding: return "\(name) needs help"
        case .resolved: return "\(name) is safe"
        case .cancelled: return "\(name) is fine"
        }
    }
}

struct SOSResponders: View {
    let state: SOSActivityAttributes.ContentState

    var body: some View {
        Text(line)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(LAPalette.paper)
            .lineLimit(2)
            .contentTransition(.numericText())
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .resolved: return "Thanks for looking out for each other."
        case .cancelled: return "Sent by mistake. Nothing to do."
        case .open, .responding:
            if state.responders == 0 { return "Nobody has answered yet." }
            if state.responders == 1 { return "1 crewmate is on the way." }
            return "\(state.responders) crewmates are on the way."
        }
    }
}

/// "I'm going" from the locked phone; gone once the SOS is over.
struct SOSGoingButton: View {
    let sosId: String
    let state: SOSActivityAttributes.ContentState

    var body: some View {
        if !SOSLockScreen.over(state) {
            Button(intent: ComingIntent(sosId: sosId)) {
                LAButtonLabel(text: "I'm going", fill: LAPalette.red, ink: LAPalette.night, stretch: false)
            }
            .buttonStyle(.plain)
        }
    }
}
