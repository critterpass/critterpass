import ActivityKit
import SwiftUI
import WidgetKit

/// The vote-closing Live Activity: the question, when it closes, the live tallies as buttons that
/// vote from the lock screen, and a "you voted" stamp. The frame is shared by the whole crew, so
/// the phone finds its own member among the voters by hash. Closed, it shows the winner.
struct VoteLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VoteActivityAttributes.self) { context in
            VoteLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
                .widgetURL(LADeepLink.url(route: "vote/\(context.attributes.pollId)"))
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VoteEyebrow(state: state)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VoteCloses(state: state, size: 14)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        VoteQuestion(attributes: context.attributes, state: state, lines: 1)
                        VoteOptions(pollId: context.attributes.pollId, state: state)
                    }
                    .padding(.horizontal, 10)
                }
            } compactLeading: {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(LAPalette.yellow)
            } compactTrailing: {
                VoteCloses(state: state, size: 13)
            } minimal: {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(LAPalette.yellow)
            }
            .keylineTint(LAPalette.yellow)
            .widgetURL(LADeepLink.url(route: "vote/\(context.attributes.pollId)"))
        }
    }
}

struct VoteLockScreen: View {
    let attributes: VoteActivityAttributes
    let state: VoteActivityAttributes.ContentState

    var body: some View {
        let voted = VoteBoard.viewerVoted(
            voted: state.voted, pollId: attributes.pollId, uid: try? ActionKeyStore.read().userId)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                VoteEyebrow(state: state)
                LAPill(tier: .free)
                Spacer(minLength: 6)
                VoteCloses(state: state, size: 13)
            }
            VoteQuestion(attributes: attributes, state: state, lines: state.tallies.count > 2 ? 1 : 2)
            VoteOptions(pollId: attributes.pollId, state: state)
            HStack(spacing: 8) {
                Text("\(state.voted.count) OF \(state.eligible) VOTED")
                    .font(.laLabel)
                    .tracking(0.8)
                    .foregroundStyle(LAPalette.muted)
                    .contentTransition(.numericText())
                Spacer(minLength: 4)
                if voted { VoteStamp() }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

struct VoteEyebrow: View {
    let state: VoteActivityAttributes.ContentState

    var body: some View {
        LAEyebrow(text: Text(line), tint: state.state == .open ? LAPalette.yellow : LAPalette.muted)
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .open: return "THE VOTE"
        case .closed: return "VOTE CLOSED"
        case .cancelled: return "VOTE CANCELLED"
        }
    }
}

/// Time left while the vote is open, counted by the system.
struct VoteCloses: View {
    let state: VoteActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        if state.state == .open, state.closesAt.laDate > .now {
            Text(timerInterval: Date.now...state.closesAt.laDate, countsDown: true)
                .font(.system(size: size, weight: .heavy).monospacedDigit())
                .foregroundStyle(LAPalette.yellow)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 76, alignment: .trailing)
        }
    }
}

/// The question, or the winner once the vote has closed.
struct VoteQuestion: View {
    let attributes: VoteActivityAttributes
    let state: VoteActivityAttributes.ContentState
    let lines: Int

    var body: some View {
        Group {
            if state.state == .closed, let winner = state.winnerLabel {
                Text("\(winner.uppercased()) WINS")
            } else {
                Text(attributes.question)
            }
        }
        .font(.system(size: 16, weight: .heavy))
        .foregroundStyle(LAPalette.paper)
        .lineLimit(lines)
        .minimumScaleFactor(0.8)
    }
}

/// One button per option, two to a row: its name and its count, the leader filled.
struct VoteOptions: View {
    let pollId: String
    let state: VoteActivityAttributes.ContentState

    var body: some View {
        let rows = stride(from: 0, to: state.tallies.count, by: 2).map {
            Array(state.tallies[$0..<min($0 + 2, state.tallies.count)])
        }
        VStack(spacing: 6) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.optionId) { tally in
                        if state.state == .open {
                            Button(intent: CastBallotIntent(pollId: pollId, optionId: tally.optionId)) {
                                VoteOptionLabel(tally: tally)
                            }
                            .buttonStyle(.plain)
                        } else {
                            VoteOptionLabel(tally: tally)
                        }
                    }
                }
            }
        }
    }
}

struct VoteOptionLabel: View {
    let tally: LAVoteTally

    var body: some View {
        HStack(spacing: 4) {
            Text(tally.label.uppercased())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(verbatim: "·")
            Text("\(tally.count)")
                .monospacedDigit()
                .contentTransition(.numericText())
        }
        .font(.system(size: 12, weight: .heavy))
        .tracking(0.6)
        .foregroundStyle(tally.leading ? LAPalette.night : LAPalette.paper)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 30)
        .background(tally.leading ? LAPalette.yellow : LAPalette.chip, in: Capsule())
    }
}

/// The "you voted" stamp: inked at an angle, like a passport stamp.
struct VoteStamp: View {
    var body: some View {
        Text("YOU VOTED")
            .font(.system(size: 9, weight: .black))
            .tracking(1)
            .foregroundStyle(LAPalette.green)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(LAPalette.green, lineWidth: 1.5))
            .rotationEffect(.degrees(-4))
            .transition(.scale.combined(with: .opacity))
    }
}
