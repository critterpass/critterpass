import ActivityKit
import SwiftUI
import WidgetKit

/// The leave-by in the Dynamic Island (5a-5): the guide's critter peeks from the left and the
/// countdown sits right (compact); the critter alone (minimal); expanded, the lock screen's
/// headline and trail over I'M UP and ASK <GUIDE>, which becomes SNOOZE once it is time to go.
enum LeaveByIsland {
    static func make(
        attributes: LeaveByActivityAttributes, state: LeaveByActivityAttributes.ContentState
    ) -> DynamicIsland {
        let guide = LAGuide(slug: attributes.guide)
        let cheering = state.state == .go || state.state == .done
        return DynamicIsland {
            // Beside the camera each side has about 110 pt: a small badge and a headline that
            // scales down rather than truncating.
            DynamicIslandExpandedRegion(.leading, priority: 1) {
                HStack(spacing: 6) {
                    LeaveByBadge(guide: guide, state: state.state, size: 32)
                    LeaveByHeadline(state: state, tint: guide.tint, timeSize: 18)
                }
                .padding(.leading, 4)
            }
            DynamicIslandExpandedRegion(.trailing) {
                LeaveByCountdown(state: state, tint: guide.tint)
                    .padding(.trailing, 4)
            }
            DynamicIslandExpandedRegion(.bottom) {
                VStack(spacing: 10) {
                    LeaveByTrail(legs: attributes.legs, state: state, guide: guide)
                    HStack(spacing: 8) {
                        LeaveByImUpButton(
                            leaveById: attributes.leaveById, state: state.state, wide: true)
                        LeaveByIslandSecondButton(attributes: attributes, state: state.state)
                    }
                }
                .padding(.horizontal, 10)
            }
        } compactLeading: {
            guide.art(cheer: cheering)
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
        } compactTrailing: {
            IslandMinutes(state: state, tint: guide.tint)
        } minimal: {
            guide.art(cheer: cheering)
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
        }
        .keylineTint(guide.tint)
    }
}

/// Minutes to leave time, or the up count once it is time to go.
private struct IslandMinutes: View {
    let state: LeaveByActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        if state.state == .waiting || state.state == .soon, state.leaveAt.laDate > .now {
            Text(timerInterval: Date.now...state.leaveAt.laDate, countsDown: true)
                .font(.system(size: 14, weight: .heavy).monospacedDigit())
                .foregroundStyle(tint)
                .frame(maxWidth: 48)
        } else {
            Text("\(state.upCount)/\(state.total)")
                .font(.system(size: 14, weight: .heavy).monospacedDigit())
                .foregroundStyle(state.state == .late ? LAPalette.orange : tint)
        }
    }
}

/// Beside I'M UP: ask the guide (opens the guide sheet) while there is time, SNOOZE once it is time
/// to go or late, nothing once the crew is on the way.
private struct LeaveByIslandSecondButton: View {
    let attributes: LeaveByActivityAttributes
    let state: LALeaveByState

    var body: some View {
        switch state {
        case .go, .late:
            Button(intent: SnoozeIntent(leaveById: attributes.leaveById)) {
                label(Text("SNOOZE"))
            }
            .buttonStyle(.plain)
        case .waiting, .soon:
            if let url = LADeepLink.url(route: "guide/new") {
                Link(destination: url) {
                    label(Text("ASK \(LAGuide.displayName(slug: attributes.guide).uppercased())"))
                }
            }
        case .done:
            EmptyView()
        }
    }

    private func label(_ text: Text) -> some View {
        text
            .font(.system(size: 13, weight: .heavy))
            .tracking(0.8)
            .foregroundStyle(LAPalette.paper)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(LAPalette.chip, in: Capsule())
    }
}
