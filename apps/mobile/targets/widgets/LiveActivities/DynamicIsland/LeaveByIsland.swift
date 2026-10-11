import ActivityKit
import SwiftUI
import WidgetKit

/// The leave-by in the Dynamic Island. Expanded (6.27): the guide's badge, "LEAVE BY" over what the
/// crew is leaving for, the leave time large in sun on the right, the trail, then "I'm up" in sun
/// and "Ask <guide>" (which becomes "Snooze" once it is time to go). Compact (1.08): the critter on
/// a sun disc and the minutes left; minimal: the critter alone. Tapping opens the hub on the pickup.
enum LeaveByIsland {
    static func make(
        attributes: LeaveByActivityAttributes, state: LeaveByActivityAttributes.ContentState
    ) -> DynamicIsland {
        let guide = LAGuide(slug: attributes.guide)
        let cheering = state.state == .go || state.state == .done
        return DynamicIsland {
            // Beside the camera each side has about 110 pt: the headline scales down rather than
            // truncating.
            DynamicIslandExpandedRegion(.leading, priority: 1) {
                HStack(spacing: 10) {
                    LAGuideBadge(guide: guide, cheering: cheering)
                    LeaveByHeadline(
                        state: state, title: attributes.title, ink: LAIsland.text,
                        eyebrowInk: LAIsland.eyebrow, titleSize: 15)
                }
                .padding(.leading, 4)
                .islandAppearance()
            }
            DynamicIslandExpandedRegion(.trailing) {
                LeaveByTime(state: state, ink: LAPalette.yellow, size: 34, showsCountdown: false)
                    .padding(.trailing, 4)
                    .islandAppearance()
            }
            DynamicIslandExpandedRegion(.bottom) {
                VStack(spacing: 12) {
                    LeaveByTrail(
                        legs: attributes.legs, state: state, fill: LAPalette.yellow,
                        reached: LAPalette.yellow, upcoming: LAIsland.upcoming, ring: .black,
                        labels: LAIsland.muted)
                    HStack(spacing: 8) {
                        LeaveByImUpButton(
                            leaveById: attributes.leaveById, state: state.state, wide: true)
                        LeaveByIslandSecondButton(attributes: attributes, state: state.state)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, 4)
                .islandAppearance()
            }
        } compactLeading: {
            guide.art(cheer: cheering)
                .resizable()
                .scaledToFit()
                .padding(1)
                .frame(width: 24, height: 24)
                .background(LAPalette.yellow, in: Circle())
        } compactTrailing: {
            IslandMinutes(state: state)
        } minimal: {
            guide.art(cheer: cheering)
                .resizable()
                .scaledToFit()
                .frame(width: 20, height: 20)
        }
        .keylineTint(LAPalette.yellow)
        .widgetURL(LeaveByLinks.hub(attributes: attributes))
    }
}

/// Minutes to leave time, or the up count once it is time to go.
private struct IslandMinutes: View {
    let state: LeaveByActivityAttributes.ContentState

    var body: some View {
        if state.state == .waiting || state.state == .soon, state.leaveAt.laDate > .now {
            Text(timerInterval: Date.now...state.leaveAt.laDate, countsDown: true)
                .font(.system(size: 14, weight: .bold).monospacedDigit())
                .foregroundStyle(LAIsland.text)
                .frame(maxWidth: 48)
        } else {
            Text("\(state.upCount)/\(state.total)")
                .font(.system(size: 14, weight: .bold).monospacedDigit())
                .foregroundStyle(state.state == .late ? LAPalette.orange : LAIsland.text)
        }
    }
}

/// Beside "I'm up": ask the guide about this pickup while there is time, "Snooze" once it is time
/// to go or late, nothing once the crew is on the way.
private struct LeaveByIslandSecondButton: View {
    let attributes: LeaveByActivityAttributes
    let state: LALeaveByState

    var body: some View {
        switch state {
        case .go, .late:
            Button(intent: SnoozeIntent(leaveById: attributes.leaveById)) {
                label(Text("Snooze"))
            }
            .buttonStyle(.plain)
        case .waiting, .soon:
            if let url = LeaveByLinks.askGuide(attributes: attributes) {
                Link(destination: url) {
                    label(Text("Ask \(LAGuide.displayName(slug: attributes.guide))"))
                }
            }
        case .done:
            EmptyView()
        }
    }

    private func label(_ text: Text) -> some View {
        text
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(LAIsland.text)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(LAIsland.chip, in: Capsule())
    }
}
