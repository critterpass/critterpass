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

    static func ground(_ entry: HomeWidgetEntry) -> Color {
        switch face(entry) {
        case .owed: return LAPalette.green
        case .owes: return LAPalette.orange
        case .settled, .none: return LAPalette.card
        }
    }

    var body: some View {
        if entry.file == nil {
            HomeWidgetSignedOut()
        } else {
            let face = Self.face(entry)
            let ink = face == nil || face == .settled ? LAPalette.paper : LAPalette.night
            VStack(alignment: .leading, spacing: 2) {
                Text(eyebrow(face))
                    .font(.laEyebrow)
                    .tracking(1.2)
                    .foregroundStyle(ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Group {
                    switch face {
                    case .owed(let amount), .owes(let amount):
                        Text(verbatim: amount)
                            .font(.system(size: 38, weight: .black).monospacedDigit())
                            .privacySensitive()
                    case .settled:
                        Text("ALL SQUARE").font(.system(size: 24, weight: .black))
                    case .none:
                        Text("No expenses yet.").font(.system(size: 14, weight: .semibold))
                    }
                }
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                Spacer(minLength: 0)
                Text("SEE WHO")
                    .font(.system(size: 12, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(face == nil || face == .settled ? LAPalette.night : LAPalette.paper)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(face == nil || face == .settled ? LAPalette.yellow : LAPalette.card, in: Capsule())
                HomeWidgetStaleLine(entry: entry, ink: ink.opacity(0.7))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
