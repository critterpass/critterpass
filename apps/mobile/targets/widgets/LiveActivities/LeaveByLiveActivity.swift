import ActivityKit
import SwiftUI
import WidgetKit

/// The leave-by Live Activity (lock screen in the 6.32 language: system glass, the guide's badge,
/// ink text, sentence case; the Dynamic Island is 6.27): what the crew is leaving for and when,
/// the countdown, the trail from where the crew sleeps to the first stop with the guide's critter
/// at its place on it, one pip per member that fills when they are up, and "I'm up". Frames change
/// only by push (never animated in between); numbers and pips transition on update. The member's
/// own pip reads "sending" between an "I'm up" tap and the server's frame showing it. Tapping it
/// opens the trip hub on the pickup.
struct LeaveByLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LeaveByActivityAttributes.self) { context in
            LeaveByLockScreen(
                attributes: context.attributes, state: context.state,
                sendingPip: LeaveByPips.sending(activityId: context.activityID, state: context.state)
            )
            .activityBackgroundTint(nil)
            .activitySystemActionForegroundColor(LAPalette.paper)
            .widgetURL(LeaveByLinks.hub(attributes: context.attributes))
        } dynamicIsland: { context in
            LeaveByIsland.make(attributes: context.attributes, state: context.state)
        }
    }
}

/// Where the leave-by's taps go.
enum LeaveByLinks {
    /// The trip hub, scrolled to the pickup.
    static func hub(attributes: LeaveByActivityAttributes) -> URL? {
        LADeepLink.url(route: "trips/\(attributes.tripId)?focus=leave_by:\(attributes.leaveById)")
    }

    /// The guide chat, opened about this pickup.
    static func askGuide(attributes: LeaveByActivityAttributes) -> URL? {
        LADeepLink.url(
            route: "guide/new?trip=\(attributes.tripId)&leave_by=\(attributes.leaveById)")
    }
}

struct LeaveByLockScreen: View {
    let attributes: LeaveByActivityAttributes
    let state: LeaveByActivityAttributes.ContentState
    var sendingPip: Int?

    var body: some View {
        let guide = LAGuide(slug: attributes.guide)
        // The system clips a lock screen activity at 160 pt: every size below is chosen to fit.
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                LAGuideBadge(guide: guide, cheering: state.state == .go || state.state == .done)
                LeaveByHeadline(state: state, title: attributes.title, ink: LAPalette.paper)
                Spacer(minLength: 8)
                LeaveByTime(state: state, ink: LAPalette.paper, size: 24)
            }
            LeaveByTrail(
                legs: attributes.legs, state: state, fill: LAPalette.paper,
                reached: LAPalette.paper, upcoming: LAPalette.track, ring: LAPalette.card,
                labels: LAPalette.muted)
            HStack(spacing: 10) {
                LeaveByPips(state: state, sendingPip: sendingPip, ink: LAPalette.muted)
                Spacer(minLength: 4)
                LeaveByImUpButton(leaveById: attributes.leaveById, state: state.state, height: 32)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

/// "LEAVE BY" (or what the moment is) over what the crew is leaving for.
struct LeaveByHeadline: View {
    let state: LeaveByActivityAttributes.ContentState
    let title: String
    let ink: Color
    var eyebrowInk: Color = LAPalette.muted
    var titleSize: CGFloat = 17

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(eyebrow)
                .font(.laEyebrow)
                .tracking(0.44)
                .foregroundStyle(state.state == .late ? LAPalette.orange : eyebrowInk)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(title)
                .font(.system(size: titleSize, weight: titleSize > 16 ? .bold : .semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private var eyebrow: LocalizedStringResource {
        switch state.state {
        case .go: return "TIME TO GO"
        case .late: return "RUNNING LATE"
        case .done: return "ON THE WAY"
        case .waiting, .soon: return "LEAVE BY"
        }
    }
}

/// The leave time, large, with the system's own countdown under it while there is time.
struct LeaveByTime: View {
    let state: LeaveByActivityAttributes.ContentState
    let ink: Color
    let size: CGFloat
    var showsCountdown = true

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(state.leaveAt.laDate, format: .dateTime.hour().minute())
                .font(.system(size: size, weight: .bold).monospacedDigit())
                .tracking(-size * 0.03)
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
            if showsCountdown, state.state == .waiting || state.state == .soon,
                state.leaveAt.laDate > .now
            {
                Text(timerInterval: Date.now...state.leaveAt.laDate, countsDown: true)
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundStyle(LAPalette.muted)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 72, alignment: .trailing)
            }
        }
    }
}

/// The stops on a solid track, filled up to where the crew is, with each stop's name under it.
struct LeaveByTrail: View {
    let legs: [String]
    let state: LeaveByActivityAttributes.ContentState
    let fill: Color
    let reached: Color
    let upcoming: Color
    /// The dots' border: the ground they sit on.
    let ring: Color
    let labels: Color

    private var position: Double {
        guard legs.count > 1 else { return 0 }
        let leg = min(Double(state.leg), Double(legs.count - 1))
        let step = leg >= Double(legs.count - 1) ? 0 : Double(state.progress) / 10
        return (leg + step) / Double(legs.count - 1)
    }

    var body: some View {
        VStack(spacing: 4) {
            GeometryReader { geo in
                let width = geo.size.width - 12
                let x = 6 + width * position
                ZStack {
                    Capsule().fill(upcoming).frame(width: width, height: 4)
                        .position(x: 6 + width / 2, y: 6)
                    Capsule().fill(fill).frame(width: max(4, x - 6), height: 4)
                        .position(x: 6 + max(4, x - 6) / 2, y: 6)
                    ForEach(Array(legs.indices), id: \.self) { index in
                        let done = Double(index) <= position * Double(legs.count - 1) + 0.001
                        Circle()
                            .fill(done ? reached : upcoming)
                            .overlay(Circle().strokeBorder(ring, lineWidth: 2))
                            .frame(width: 12, height: 12)
                            .position(
                                x: 6 + width * Double(index) / Double(max(1, legs.count - 1)), y: 6)
                    }
                }
            }
            .frame(height: 12)
            HStack {
                ForEach(Array(legs.enumerated()), id: \.offset) { index, leg in
                    Text(leg)
                        .font(.laLabel)
                        .foregroundStyle(labels)
                        .lineLimit(1)
                    if index < legs.count - 1 { Spacer(minLength: 4) }
                }
            }
        }
    }
}

/// One pip per member (who is up is shared crew state), then "4 of 6 up". The member's own pip,
/// while an "I'm up" tap is on its way, is an outline in the fill colour.
struct LeaveByPips: View {
    let state: LeaveByActivityAttributes.ContentState
    var sendingPip: Int?
    let ink: Color

    /// The pip an "I'm up" tap on this phone left marked as sending, if the frame still calls for it.
    static func sending(activityId: String, state: LeaveByActivityAttributes.ContentState) -> Int? {
        LeaveBySendingMark.read(activityId: activityId, root: AppGroupContainer.url)?.sendingPip(
            hashes: state.pips.map(\.uidHash), ups: state.pips.map(\.up), seq: state.seq, now: .now)
    }

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(Array(state.pips.enumerated()), id: \.offset) { index, pip in
                    Group {
                        if index == sendingPip {
                            Capsule()
                                .strokeBorder(LAPalette.green, lineWidth: 1.5)
                                .accessibilityLabel(Text("Sending"))
                        } else {
                            Capsule()
                                .fill(pip.up ? LAPalette.green : LAPalette.track)
                        }
                    }
                    .frame(minWidth: 4, maxWidth: state.pips.count > 8 ? 12 : 22)
                    .frame(height: 6)
                }
            }
            Text("\(state.upCount) of \(state.total) up")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
                .fixedSize()
                .contentTransition(.numericText())
        }
    }
}

/// "I'm up" from the locked phone: the intent records it and the crew's pips update by push.
struct LeaveByImUpButton: View {
    let leaveById: String
    let state: LALeaveByState
    var height: CGFloat = 34
    /// Fills its half of the expanded Dynamic Island instead of hugging its label.
    var wide = false

    var body: some View {
        if state != .done {
            Button(intent: ImUpIntent(leaveById: leaveById)) {
                Text("I'm up")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(LAPalette.night)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: wide ? .infinity : nil, minHeight: height)
                    .background(LAPalette.yellow, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
