import ActivityKit
import SwiftUI
import WidgetKit

/// The crew-live Live Activity (5a-2), a Boost perk: the meet-up's place and time, the whole crew
/// on one line sliding toward the flag (each dot is an ETA step, never a position), whoever is
/// furthest out with their own line, and RUNNING LATE and SOS. Frames change only by push.
struct MeetUpLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeetUpActivityAttributes.self) { context in
            MeetUpLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let attributes = context.attributes
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading, priority: 1) {
                    VStack(alignment: .leading, spacing: 1) {
                        MeetUpEyebrow(attributes: attributes, state: state)
                        MeetUpPlace(name: attributes.placeName, size: 17)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MeetUpEta(state: state, size: 15)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        MeetUpLaneView(members: state.members)
                        if state.state != .ended && state.state != .arrived {
                            HStack(spacing: 6) {
                                Button(intent: OnMyWayIntent(tripId: attributes.tripId)) {
                                    LAButtonLabel(text: "ON MY WAY", fill: LAPalette.yellow, ink: LAPalette.night)
                                }
                                Button(
                                    intent: RunningLateIntent(
                                        tripId: attributes.tripId, meetupId: attributes.meetupId)
                                ) {
                                    LAButtonLabel(text: "RUNNING LATE")
                                }
                                Button(intent: PingAllIntent(tripId: attributes.tripId)) {
                                    LAButtonLabel(text: "PING ALL")
                                }
                            }
                            .buttonStyle(.plain)
                        } else {
                            MeetUpEnding(state: state)
                        }
                    }
                    .padding(.horizontal, 10)
                }
            } compactLeading: {
                Image(systemName: "flag.fill")
                    .foregroundStyle(LAPalette.yellow)
            } compactTrailing: {
                MeetUpEta(state: state, size: 14)
            } minimal: {
                Image(systemName: "flag.fill")
                    .foregroundStyle(LAPalette.yellow)
            }
            .keylineTint(LAPalette.pink)
        }
    }
}

struct MeetUpLockScreen: View {
    let attributes: MeetUpActivityAttributes
    let state: MeetUpActivityAttributes.ContentState

    var body: some View {
        // The system clips a lock screen activity at 160 pt, so only the furthest member gets a
        // row here; the design's second row shows in the app's crew map.
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                MeetUpEyebrow(attributes: attributes, state: state)
                LAPill(tier: .boost)
                Spacer(minLength: 6)
                MeetUpEta(state: state, size: 12)
            }
            MeetUpPlace(name: attributes.placeName, size: 22)
            MeetUpLaneView(members: state.members)
            if state.state == .ended || state.state == .arrived {
                MeetUpEnding(state: state)
            } else {
                if let straggler = state.stragglers.first {
                    MeetUpStragglerRow(straggler: straggler)
                }
                HStack(spacing: 8) {
                    Button(
                        intent: RunningLateIntent(tripId: attributes.tripId, meetupId: attributes.meetupId)
                    ) {
                        LAButtonLabel(text: "RUNNING LATE")
                    }
                    Button(intent: SOSIntent(tripId: attributes.tripId)) {
                        LAButtonLabel(text: "SOS", fill: LAPalette.pink, ink: LAPalette.night)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

/// "MEET-UP · 17:00", orange once the meet-up time has passed with someone still out.
struct MeetUpEyebrow: View {
    let attributes: MeetUpActivityAttributes
    let state: MeetUpActivityAttributes.ContentState

    var body: some View {
        LAEyebrow(
            text: Text("MEET-UP · \(attributes.meetAt.laDate, format: .dateTime.hour().minute())"),
            tint: state.state == .late ? LAPalette.orange : LAPalette.yellow)
    }
}

struct MeetUpPlace: View {
    let name: String
    let size: CGFloat

    var body: some View {
        Text(name.uppercased())
            .font(.system(size: size, weight: .black))
            .foregroundStyle(LAPalette.paper)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/// The furthest member's ETA ("22 min"), or a tick once everyone is there.
struct MeetUpEta: View {
    let state: MeetUpActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        if state.state == .arrived {
            Image(systemName: "checkmark")
                .font(.system(size: size, weight: .heavy))
                .foregroundStyle(LAPalette.green)
        } else if let minutes = state.etaMin, state.state != .ended {
            Text("\(minutes) min")
                .font(.system(size: size, weight: .semibold).monospacedDigit())
                .foregroundStyle(state.state == .late ? LAPalette.orange : LAPalette.muted)
                .lineLimit(1)
                .contentTransition(.numericText())
        }
    }
}

/// The crew on one line, the flag at its right end.
struct MeetUpLaneView: View {
    let members: [LAMeetUpMember]

    private static let dot: CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            let inset = Self.dot / 2
            let width = max(0, geo.size.width - Self.dot - 14)
            let mid = geo.size.height / 2
            ZStack {
                Capsule()
                    .fill(LAPalette.track)
                    .frame(width: width + Self.dot, height: 3)
                    .position(x: inset + width / 2, y: mid)
                Image(systemName: "flag.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.yellow)
                    .position(x: geo.size.width - 5, y: mid - 7)
                    .accessibilityHidden(true)
                ForEach(MeetUpLane.dots(steps: members.map(\.step)), id: \.member) { dot in
                    let member = members[dot.member]
                    LAMemberDot(initial: member.initial, tone: member.tone, size: Self.dot)
                        .position(x: inset + width * dot.x, y: mid + CGFloat(dot.row) * 6)
                }
            }
        }
        .frame(height: 30)
    }
}

/// Whoever is furthest out: their dot, name, and how they are getting there.
struct MeetUpStragglerRow: View {
    let straggler: LAMeetUpStraggler

    var body: some View {
        HStack(spacing: 6) {
            LAMemberDot(initial: straggler.initial, tone: straggler.tone, size: 16)
            Text(straggler.name)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(LAPalette.paper)
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(straggler.line)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LAPalette.muted)
                .lineLimit(1)
        }
    }
}

/// The final frame's line: why the activity is over.
struct MeetUpEnding: View {
    let state: MeetUpActivityAttributes.ContentState

    var body: some View {
        Text(line)
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(state.state == .arrived || state.endReason == .allArrived ? LAPalette.green : LAPalette.muted)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var line: LocalizedStringResource {
        switch state.endReason {
        case .boostEnded: return "The trip's Boost ended, so this stops here."
        case .cancelled: return "The meet-up was called off."
        case .timedOut: return "The meet-up time has passed."
        case .allArrived, .none: return "Everyone's here."
        }
    }
}
