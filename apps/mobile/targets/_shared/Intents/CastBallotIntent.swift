internal import AppIntents
import ActivityKit
import Foundation
import WidgetKit

/// A vote from the vote activity or the vote widget (api-contracts-async.md §4): queues
/// `cast_ballot` and counts it at once on this phone (the activity's tallies and stamp, or the
/// widget's count); the server's next frame and snapshot carry the real tallies to everyone.
struct CastBallotIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Vote"
    static let description = IntentDescription("Casts your vote in a crew vote.")

    @Parameter(title: "Poll ID")
    var pollId: String

    @Parameter(title: "Option ID")
    var optionId: String

    /// The vote widget's button (the ballot's source reads "widget"), else the Live Activity's.
    @Parameter(title: "From the widget")
    var fromWidget: Bool

    init() {
        pollId = ""
        optionId = ""
        fromWidget = false
    }

    init(pollId: String, optionId: String, fromWidget: Bool = false) {
        self.pollId = pollId
        self.optionId = optionId
        self.fromWidget = fromWidget
    }

    func perform() async throws -> some IntentResult {
        try PendingActionsOutbox.append(
            .ballot(pollId: pollId, optionId: optionId, via: fromWidget ? .widget : .laIntent),
            root: AppGroupContainer.url)
        if fromWidget {
            try? PendingVote(pollId: pollId, optionId: optionId, at: Date())
                .write(root: AppGroupContainer.url)
            WidgetCenter.shared.reloadTimelines(ofKind: "CPVoteWidget")
        }
        let uid = try? ActionKeyStore.read().userId
        for activity in Activity<VoteActivityAttributes>.activities
        where activity.attributes.pollId == pollId && activity.content.state.state == .open {
            let state = Self.counted(activity.content.state, pollId: pollId, optionId: optionId, uid: uid)
            await activity.update(ActivityContent(state: state, staleDate: activity.content.staleDate))
        }
        return .result()
    }

    /// The frame with this member's vote counted. A changed vote is left to the server's frame:
    /// the phone does not know which option the earlier vote was for.
    static func counted(
        _ state: VoteActivityAttributes.ContentState, pollId: String, optionId: String, uid: String?
    ) -> VoteActivityAttributes.ContentState {
        guard let uid, !uid.isEmpty else { return state }
        let already = VoteBoard.viewerVoted(voted: state.voted, pollId: pollId, uid: uid)
        guard !already else { return state }
        var next = state
        let counts = VoteBoard.counting(
            vote: optionId,
            tallies: state.tallies.map { (optionId: $0.optionId, count: $0.count) },
            alreadyVoted: already)
        let top = counts.max() ?? 0
        for index in next.tallies.indices {
            next.tallies[index].count = counts[index]
            next.tallies[index].leading = top > 0 && counts[index] == top
        }
        next.voted.append(LAMemberHash.of(scope: pollId, uid: uid))
        return next
    }
}
