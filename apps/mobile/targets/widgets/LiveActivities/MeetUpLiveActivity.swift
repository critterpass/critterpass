import ActivityKit
import SwiftUI
import WidgetKit

/// The crew-live Live Activity, a Boost perk (lock screen 6.32: system glass, the guide's badge,
/// ink text): the meet-up's place and time, the whole crew on one line sliding toward the flag
/// (each dot is an ETA step, never a position; the ink fill is how far the furthest-out member has
/// come), whoever is furthest out with their minutes, and "Running late" and SOS. Frames change
/// only by push.
struct MeetUpLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeetUpActivityAttributes.self) { context in
            MeetUpLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let attributes = context.attributes
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading, priority: 1) {
                    VStack(alignment: .leading, spacing: 1) {
                        MeetUpEyebrow(attributes: attributes, state: state, tint: LAIsland.eyebrow)
                        MeetUpPlace(name: attributes.placeName, size: 15, ink: LAIsland.text)
                    }
                    .padding(.leading, 4)
                    .islandAppearance()
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MeetUpEta(state: state, size: 24, ink: LAPalette.yellow)
                        .padding(.trailing, 4)
                        .islandAppearance()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        MeetUpLaneView(
                            members: state.members, fill: LAPalette.yellow, track: LAIsland.track,
                            ring: .black)
                        if state.state != .ended && state.state != .arrived {
                            HStack(spacing: 8) {
                                Button(intent: OnMyWayIntent(tripId: attributes.tripId)) {
                                    LAButtonLabel(
                                        text: "On my way", fill: LAPalette.yellow, ink: LAPalette.night,
                                        weight: .bold, height: 34)
                                }
                                Button(
                                    intent: RunningLateIntent(
                                        tripId: attributes.tripId, meetupId: attributes.meetupId)
                                ) {
                                    LAButtonLabel(
                                        text: "Running late", fill: LAIsland.chip, ink: LAIsland.text,
                                        height: 34)
                                }
                                Button(intent: PingAllIntent(tripId: attributes.tripId)) {
                                    LAButtonLabel(
                                        text: "Ping all", fill: LAIsland.chip, ink: LAIsland.text,
                                        height: 34)
                                }
                            }
                            .buttonStyle(.plain)
                        } else {
                            MeetUpEnding(state: state)
                        }
                    }
                    .padding(.horizontal, 8)
                    .islandAppearance()
                }
            } compactLeading: {
                Image(systemName: "flag.fill")
                    .foregroundStyle(LAPalette.yellow)
            } compactTrailing: {
                MeetUpEta(state: state, size: 14, ink: LAIsland.text)
            } minimal: {
                Image(systemName: "flag.fill")
                    .foregroundStyle(LAPalette.yellow)
            }
            .keylineTint(LAPalette.yellow)
        }
    }
}

struct MeetUpLockScreen: View {
    let attributes: MeetUpActivityAttributes
    let state: MeetUpActivityAttributes.ContentState

    var body: some View {
        // The system clips a lock screen activity at 160 pt and 6.32 draws about 196: one
        // straggler row (the furthest out, with their minutes), a 24 pt lane and 32 pt buttons
        // keep it inside; the second row shows in the app's crew map.
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                // The meet-up carries no guide: Tokek on sun, as drawn.
                LAGuideBadge(guide: LAGuide(slug: "tokek"))
                VStack(alignment: .leading, spacing: 1) {
                    MeetUpEyebrow(attributes: attributes, state: state, tint: LAPalette.muted)
                    MeetUpPlace(name: attributes.placeName, size: 17, ink: LAPalette.paper)
                }
                Spacer(minLength: 6)
                MeetUpEta(state: state, size: 24, ink: LAPalette.paper)
            }
            MeetUpLaneView(
                members: state.members, fill: LAPalette.paper, track: LAPalette.track,
                ring: Color.white, height: 24)
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
                        LAButtonLabel(text: "Running late", height: 32)
                    }
                    Button(intent: SOSIntent(tripId: attributes.tripId)) {
                        LAButtonLabel(
                            text: "SOS", fill: LAPalette.pink, ink: LAPalette.night, stretch: false,
                            weight: .heavy, height: 32
                        )
                        .frame(width: 80)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

/// "MEET-UP · 17:00", orange once the meet-up time has passed with someone still out.
struct MeetUpEyebrow: View {
    let attributes: MeetUpActivityAttributes
    let state: MeetUpActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        LAEyebrow(
            text: Text("MEET-UP · \(attributes.meetAt.laDate, format: .dateTime.hour().minute())"),
            tint: state.state == .late ? LAPalette.orange : tint)
    }
}

struct MeetUpPlace: View {
    let name: String
    let size: CGFloat
    let ink: Color

    var body: some View {
        Text(name)
            .font(.system(size: size, weight: size > 16 ? .bold : .semibold))
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/// The furthest member's ETA ("22 min"), or a tick once everyone is there.
struct MeetUpEta: View {
    let state: MeetUpActivityAttributes.ContentState
    let size: CGFloat
    let ink: Color

    var body: some View {
        if state.state == .arrived {
            Image(systemName: "checkmark")
                .font(.system(size: size * 0.8, weight: .heavy))
                .foregroundStyle(LAPalette.successText)
        } else if let minutes = state.etaMin, state.state != .ended {
            Text("\(minutes) min")
                .font(.system(size: size, weight: size > 16 ? .heavy : .bold).monospacedDigit())
                .tracking(size > 16 ? -size * 0.03 : 0)
                .foregroundStyle(state.state == .late ? LAPalette.orange : ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
        }
    }
}

/// The crew on one line, the flag at its right end, filled up to the furthest-out member.
struct MeetUpLaneView: View {
    let members: [LAMeetUpMember]
    let fill: Color
    let track: Color
    /// The dots' edge: white on the lock screen, the island's black there.
    let ring: Color
    var height: CGFloat = 28

    private static let dot: CGFloat = 22

    /// How far the furthest-out member has come along the line (0 far end, 1 the flag).
    private var progress: Double {
        let dots = MeetUpLane.dots(steps: members.map(\.step))
        return dots.map(\.x).min() ?? 0
    }

    var body: some View {
        GeometryReader { geo in
            let inset = Self.dot / 2
            let width = max(0, geo.size.width - Self.dot - 14)
            let mid = geo.size.height / 2
            ZStack {
                Capsule()
                    .fill(track)
                    .frame(width: width + Self.dot, height: 4)
                    .position(x: inset + width / 2, y: mid)
                Capsule()
                    .fill(fill)
                    .frame(width: max(4, width * progress), height: 4)
                    .position(x: inset + max(4, width * progress) / 2, y: mid)
                Image(systemName: "flag.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(fill)
                    .position(x: geo.size.width - 6, y: mid - 7)
                    .accessibilityHidden(true)
                ForEach(MeetUpLane.dots(steps: members.map(\.step)), id: \.member) { dot in
                    let member = members[dot.member]
                    LAMemberDot(initial: member.initial, tone: member.tone, size: Self.dot, ring: ring)
                        .position(x: inset + width * dot.x, y: mid + CGFloat(dot.row) * 5)
                }
            }
        }
        .frame(height: height)
    }
}

/// Whoever is furthest out: name, how they are getting there, and their minutes.
struct MeetUpStragglerRow: View {
    let straggler: LAMeetUpStraggler

    var body: some View {
        HStack(spacing: 4) {
            Text(straggler.name)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(LAPalette.paper)
                .lineLimit(1)
            Text(verbatim: "· \(straggler.line)")
                .font(.system(size: 13))
                .foregroundStyle(LAPalette.secondary)
                .lineLimit(1)
            Spacer(minLength: 6)
            if let minutes = straggler.min {
                Text("\(minutes) min")
                    .font(.system(size: 13, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LAPalette.paper)
                    .lineLimit(1)
            }
        }
    }
}

/// The final frame's line: why the activity is over.
struct MeetUpEnding: View {
    let state: MeetUpActivityAttributes.ContentState

    var body: some View {
        Text(line)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(
                state.state == .arrived || state.endReason == .allArrived
                    ? LAPalette.successText : LAPalette.muted
            )
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
