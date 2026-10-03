import SwiftUI
import WidgetKit

/// The vote on the lock screen (5c-3, circular): the score with the leader first ("4–2") and the
/// leader's name under it.
struct VoteScoreAccessory: View {
    let entry: HomeWidgetEntry

    var body: some View {
        let face = entry.file.flatMap { file in
            VoteFace.make(
                vote: file.snapshot.vote,
                pending: entry.pendingVote.flatMap { $0.pollId == file.snapshot.vote?.pollId ? $0.optionId : nil })
        }
        ZStack {
            AccessoryWidgetBackground()
            if let score = AccessoryModel.voteScore(face) {
                VStack(spacing: 0) {
                    Text(verbatim: score.score)
                        .font(.system(size: 17, weight: .black).monospacedDigit())
                        .widgetAccentable()
                    Text(verbatim: score.leader.uppercased())
                        .font(.system(size: 7, weight: .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
                .padding(4)
            } else {
                Image(systemName: "checkmark.seal")
                    .font(.system(size: 18, weight: .bold))
            }
        }
    }
}
