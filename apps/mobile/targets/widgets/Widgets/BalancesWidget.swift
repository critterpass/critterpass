import SwiftUI
import WidgetKit

/// The balances widget (5c-2, small): the viewer's own net on the trip, owed (green) or owing
/// (orange), hidden when the phone is locked. Tapping opens the money screen. Free.
struct BalancesWidget: Widget {
    let kind = "CPBalancesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { entry in
            BalancesView(entry: entry)
                .containerBackground(for: .widget) { BalancesView.ground(entry) }
                .widgetURL(LADeepLink.url(route: "wallet/money"))
        }
        .pushHandler(CPWidgetPushHandler.self)
        .configurationDisplayName("Balances")
        .description("Who owes who on the trip.")
        .supportedFamilies([.systemSmall])
    }
}

struct BalancesView: View {
    let entry: HomeWidgetEntry

    static func face(_ entry: HomeWidgetEntry) -> BalanceFace? {
        BalanceFace.make(entry.file?.snapshot.balances)
    }

    /// The same light card on every face (6.31); the amount carries the meaning.
    static func ground(_ entry: HomeWidgetEntry) -> Color {
        LAPalette.card
    }

    var body: some View {
        if let file = entry.file {
            let acted = WidgetTaps.read(root: AppGroupContainer.url).ids(at: entry.date)
            let face = Self.face(entry)
            let ink = LAPalette.paper
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow(face))
                    .font(.system(size: 11.5, weight: .bold))
                    .tracking(0.46)
                    .foregroundStyle(LAPalette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Group {
                    switch face {
                    case .owed(let amount), .owes(let amount):
                        Text(verbatim: amount)
                            .font(.system(size: 36, weight: .heavy).monospacedDigit())
                            .tracking(-1.08)
                            .privacySensitive()
                    case .settled:
                        Text("All square").font(.system(size: 24, weight: .heavy))
                    case .none:
                        Text("No expenses yet.").font(.system(size: 14, weight: .semibold))
                    }
                }
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                Spacer(minLength: 0)
                if let nudge = NudgeFace.make(file.snapshot.balances, now: entry.date, acted: acted),
                   let tripId = file.snapshot.trip?.id
                {
                    if nudge.sentEarlier {
                        Text("Nudged \(nudge.firstName)")
                            .modifier(BalancesPill(ink: LAPalette.muted, fill: LAPalette.chip))
                    } else {
                        Button(intent: NudgeIntent(userId: nudge.userId, tripId: tripId)) {
                            Text("Nudge \(nudge.firstName)")
                                .modifier(BalancesPill(ink: LAPalette.card, fill: LAPalette.paper))
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    Text("See who")
                        .modifier(BalancesPill(ink: LAPalette.card, fill: LAPalette.paper))
                }
                HomeWidgetStaleLine(entry: entry)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            HomeWidgetSignedOut()
        }
    }

    private func eyebrow(_ face: BalanceFace?) -> LocalizedStringResource {
        switch face {
        case .owed: return "YOU'RE OWED"
        case .owes: return "YOU OWE"
        case .settled, .none: return "BALANCES"
        }
    }
}

/// The capsule at the foot of the balances widget.
struct BalancesPill: ViewModifier {
    let ink: Color
    let fill: Color

    func body(content: Content) -> some View {
        content
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, minHeight: 32)
            .background(fill, in: Capsule())
    }
}
