import ActivityKit
import SwiftUI
import WidgetKit

/// The leave-by Live Activity (5a-1 lock screen, 5a-5 Dynamic Island): leave time and the
/// countdown to it, the trail from where the crew sleeps to the first stop with the guide's
/// critter at its place on it, one pip per member that fills when they are up, and I'M UP.
/// Frames change only by push (never animated in between); numbers and pips transition on update.
struct LeaveByLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LeaveByActivityAttributes.self) { context in
            LeaveByLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            LeaveByIsland.make(attributes: context.attributes, state: context.state)
        }
    }
}

struct LeaveByLockScreen: View {
    let attributes: LeaveByActivityAttributes
    let state: LeaveByActivityAttributes.ContentState

    var body: some View {
        let guide = LAGuide(slug: attributes.guide)
        // The system clips a lock screen activity at 160 pt: every size below is chosen to fit.
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 10) {
                LeaveByBadge(guide: guide, state: state.state, size: 40)
                LeaveByHeadline(state: state, tint: guide.tint, timeSize: 24, showsTier: true)
                Spacer(minLength: 8)
                LeaveByCountdown(state: state, tint: guide.tint)
            }
            LeaveByTrail(legs: attributes.legs, state: state, guide: guide)
            HStack(spacing: 10) {
                LeaveByPips(state: state)
                Spacer(minLength: 4)
                LeaveByImUpButton(leaveById: attributes.leaveById, state: state.state)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

struct LeaveByBadge: View {
    let guide: LAGuide
    let state: LALeaveByState
    let size: CGFloat

    var body: some View {
        guide.art(cheer: state == .go || state == .done)
            .resizable()
            .scaledToFit()
            .padding(3)
            .frame(width: size, height: size)
            .background(guide.tint, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
            .accessibilityHidden(true)
    }
}

struct LeaveByHeadline: View {
    let state: LeaveByActivityAttributes.ContentState
    let tint: Color
    let timeSize: CGFloat
    /// The FREE pill beside the eyebrow (5a-1); the Dynamic Island has no room for it.
    var showsTier = false

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 6) {
                Text(eyebrow)
                    .font(.laEyebrow)
                    .tracking(1.2)
                    .foregroundStyle(state.state == .late ? LAPalette.orange : tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if showsTier { LAPill(tier: .free) }
            }
            Text(state.leaveAt.laDate, format: .dateTime.hour().minute())
                .font(.system(size: timeSize, weight: .black).monospacedDigit())
                .foregroundStyle(LAPalette.paper)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText())
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

/// Minutes and seconds to leave time, counted by the system (no pushes needed to tick).
struct LeaveByCountdown: View {
    let state: LeaveByActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if state.state == .waiting || state.state == .soon, state.leaveAt.laDate > .now {
                Text(timerInterval: Date.now...state.leaveAt.laDate, countsDown: true)
                    .font(.system(size: 20, weight: .heavy).monospacedDigit())
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 72, alignment: .trailing)
            }
            Text(state.placeLine)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(LAPalette.muted)
                .lineLimit(1)
        }
    }
}

/// The stops with the guide's critter where the crew is: solid up to it, dashed after.
struct LeaveByTrail: View {
    let legs: [String]
    let state: LeaveByActivityAttributes.ContentState
    let guide: LAGuide

    private var position: Double {
        guard legs.count > 1 else { return 0 }
        let leg = min(Double(state.leg), Double(legs.count - 1))
        let step = leg >= Double(legs.count - 1) ? 0 : Double(state.progress) / 10
        return (leg + step) / Double(legs.count - 1)
    }

    var body: some View {
        VStack(spacing: 3) {
            GeometryReader { geo in
                let width = geo.size.width - 12
                let x = 6 + width * position
                ZStack {
                    Path { path in
                        path.move(to: CGPoint(x: 6, y: 21))
                        path.addLine(to: CGPoint(x: 6 + width, y: 21))
                    }
                    .stroke(LAPalette.track, style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
                    Path { path in
                        path.move(to: CGPoint(x: 6, y: 21))
                        path.addLine(to: CGPoint(x: x, y: 21))
                    }
                    .stroke(guide.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    ForEach(Array(legs.indices), id: \.self) { index in
                        let reached = Double(index) <= position * Double(legs.count - 1) + 0.001
                        Circle()
                            .strokeBorder(reached ? guide.tint : LAPalette.track, lineWidth: 2)
                            .background(Circle().fill(reached ? guide.tint : LAPalette.card))
                            .frame(width: 12, height: 12)
                            .position(
                                x: 6 + width * Double(index) / Double(max(1, legs.count - 1)), y: 21)
                    }
                    guide.art(cheer: state.state == .go || state.state == .done)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 18, height: 18)
                        .position(x: x, y: 8)
                        .accessibilityHidden(true)
                }
            }
            .frame(height: 28)
            HStack {
                ForEach(Array(legs.enumerated()), id: \.offset) { index, leg in
                    Text(leg.uppercased())
                        .font(.laLabel)
                        .tracking(0.8)
                        .foregroundStyle(LAPalette.muted)
                        .lineLimit(1)
                    if index < legs.count - 1 { Spacer(minLength: 4) }
                }
            }
        }
    }
}

/// One pip per member (who is up is shared crew state), then "4 OF 6 UP".
struct LeaveByPips: View {
    let state: LeaveByActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 4) {
                ForEach(Array(state.pips.enumerated()), id: \.offset) { _, pip in
                    Capsule()
                        .fill(pip.up ? LAPalette.green : LAPalette.chip)
                        .frame(minWidth: 4, maxWidth: state.pips.count > 8 ? 12 : 24)
                        .frame(height: 6)
                }
            }
            Text("\(state.upCount) OF \(state.total) UP")
                .font(.laLabel)
                .tracking(0.8)
                .foregroundStyle(LAPalette.paper)
                .lineLimit(1)
                .fixedSize()
                .contentTransition(.numericText())
        }
    }
}

/// I'M UP from the locked phone: the intent records it and the crew's pips update by push.
struct LeaveByImUpButton: View {
    let leaveById: String
    let state: LALeaveByState

    var body: some View {
        if state != .done {
            Button(intent: ImUpIntent(leaveById: leaveById)) {
                Text("I'M UP")
                    .font(.system(size: 13, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(LAPalette.night)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(LAPalette.yellow, in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}
