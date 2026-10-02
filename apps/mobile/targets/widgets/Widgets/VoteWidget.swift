internal import AppIntents
import SwiftUI
import WidgetKit

/// The vote widget (5c-1, medium): the showdown's two leaders on either side, tap a side to vote
/// (counted at once on this phone, sent with the app's outbox), and the result once it closes.
/// Free.
struct VoteWidget: Widget {
    let kind = "CPVoteWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { entry in
            VoteWidgetView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
        }
        .configurationDisplayName("The vote")
        .description("Your crew's vote. Tap a side to vote.")
        .supportedFamilies([.systemMedium])
        .contentMarginsDisabled()
    }
}

struct VoteWidgetView: View {
    let entry: HomeWidgetEntry

    var body: some View {
        if let file = entry.file {
            let pending = entry.pendingVote.flatMap { pending in
                pending.pollId == file.snapshot.vote?.pollId ? pending.optionId : nil
            }
            if let face = VoteFace.make(vote: file.snapshot.vote, pending: pending) {
                VoteShowdown(face: face)
                    .widgetURL(LADeepLink.url(route: "vote/\(face.pollId)"))
            } else {
                quiet(String(localized: "No vote running. Start one in crew chat."))
            }
        } else {
            HomeWidgetSignedOut().padding(16)
        }
    }

    private func quiet(_ line: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("THE VOTE")
                .font(.laEyebrow)
                .tracking(1.2)
                .foregroundStyle(LAPalette.yellow)
            Text(verbatim: line)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(LAPalette.paper)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Two halves split on a slant (orange left, blue right), each side's place and critter, and the
/// vote buttons along the bottom with the closing day between them.
struct VoteShowdown: View {
    let face: VoteFace

    var body: some View {
        ZStack {
            LAPalette.blue
            VoteSlant().fill(LAPalette.orange)
            HStack(alignment: .top) {
                side(face.left, art: "tanuki-common-idle-color-48pt", alignment: .leading)
                Spacer(minLength: 8)
                side(face.right, art: "sardine-common-idle-color-48pt", alignment: .trailing)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .frame(maxHeight: .infinity, alignment: .top)
            HStack(spacing: 6) {
                button(face.left)
                middle
                button(face.right)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 10)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
    }

    private func side(_ side: VoteFace.Side, art: String, alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(side.label.uppercased())
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(LAPalette.night)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if face.closed && side.winner {
                Text("WINS")
                    .font(.laEyebrow)
                    .tracking(1.2)
                    .foregroundStyle(LAPalette.night)
            }
            Image(art)
                .resizable()
                .scaledToFit()
                .frame(width: 44, height: 44)
                .opacity(face.closed && !side.winner ? 0.4 : 1)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func button(_ side: VoteFace.Side) -> some View {
        let label = HStack(spacing: 4) {
            if side.mine { Image(systemName: "checkmark").font(.system(size: 10, weight: .black)) }
            Text(verbatim: "\(side.label.uppercased()) · ")
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text("\(side.votes)")
                .monospacedDigit()
                .contentTransition(.numericText())
        }
        .font(.system(size: 12, weight: .heavy))
        .tracking(0.6)
        .foregroundStyle(side.mine ? LAPalette.night : LAPalette.paper)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: 32)
        .background(side.mine ? LAPalette.paper : LAPalette.card, in: Capsule())
        if face.closed {
            label
        } else {
            Button(intent: CastBallotIntent(pollId: face.pollId, optionId: side.optionId, fromWidget: true)) {
                label
            }
            .buttonStyle(.plain)
        }
    }

    /// The closing day ("FRI"), "+2" more options, or nothing once closed.
    @ViewBuilder
    private var middle: some View {
        let text: String? =
            face.closed ? nil
            : face.more > 0 ? "+\(face.more)"
            : face.closesAt.map { $0.formatted(.dateTime.weekday(.abbreviated)).uppercased() }
        if let text {
            Text(verbatim: text)
                .font(.system(size: 10, weight: .black))
                .foregroundStyle(LAPalette.night)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(LAPalette.paper, in: RoundedRectangle(cornerRadius: 5))
                .fixedSize()
        }
    }
}

/// The left side of the split: top edge to 60 %, bottom edge to 40 %.
struct VoteSlant: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.6, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.4, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
