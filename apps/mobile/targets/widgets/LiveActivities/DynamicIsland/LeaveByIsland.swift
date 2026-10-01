import ActivityKit
import SwiftUI
import WidgetKit

/// The leave-by in the Dynamic Island (5a-5): the guide's critter peeks from the left and the
/// countdown sits right (compact); the critter alone (minimal); expanded, the lock screen's
/// headline, trail and I'M UP.
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
                VStack(spacing: 8) {
                    LeaveByTrail(legs: attributes.legs, state: state, guide: guide)
                    HStack {
                        LeaveByPips(state: state)
                        Spacer(minLength: 4)
                        LeaveByImUpButton(leaveById: attributes.leaveById, state: state.state)
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
