import SwiftUI
import WidgetKit

/// The Critterdex widget (5c-1, small): critters found out of the set, three of them drawn
/// underneath, the last still a silhouette. Free.
struct CritterdexWidget: Widget {
    let kind = "CPCritterdexWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { entry in
            CritterdexFamilyView(entry: entry)
                .widgetURL(LADeepLink.url(route: "pass"))
        }
        .configurationDisplayName("Critterdex")
        .description("How many critters you have found.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

/// A timeline that only changes when the app writes a new snapshot (it reloads the widgets then).
struct HomeSnapshotProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeWidgetEntry {
        HomeWidgetEntry(date: Date(), file: nil, pendingVote: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeWidgetEntry) -> Void) {
        completion(.now())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) {
        let entry = HomeWidgetEntry.now()
        // Look again after the snapshot would count as stale, so the "Updated" line appears.
        let later = entry.file.map { $0.generatedAt.addingTimeInterval(WidgetSnapshotFile.staleAfter + 60) }
        completion(Timeline(entries: [entry], policy: later.map { .after($0) } ?? .never))
    }
}

/// The home-screen card, or the lock-screen bar.
struct CritterdexFamilyView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if family == .accessoryRectangular {
            CritterdexAccessory(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        } else {
            CritterdexView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
        }
    }
}

struct CritterdexView: View {
    let entry: HomeWidgetEntry

    var body: some View {
        if let dex = entry.file?.snapshot.critterdex {
            VStack(alignment: .leading, spacing: 2) {
                Text("CRITTERDEX")
                    .font(.laEyebrow)
                    .tracking(1.2)
                    .foregroundStyle(LAPalette.muted)
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("\(dex.found)")
                        .font(.system(size: 34, weight: .black).monospacedDigit())
                        .foregroundStyle(LAPalette.paper)
                        .contentTransition(.numericText())
                    Text(verbatim: "/\(dex.total)")
                        .font(.system(size: 34, weight: .black).monospacedDigit())
                        .foregroundStyle(LAPalette.muted)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                Spacer(minLength: 0)
                HStack(alignment: .bottom, spacing: 8) {
                    critter("gecko-common-idle-color-48pt", found: dex.found > 0)
                    critter("sardine-common-idle-color-48pt", found: dex.found > 1)
                    critter("tanuki-common-idle-color-48pt", found: false)
                }
                HomeWidgetStaleLine(entry: entry)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Critterdex, \(dex.found) of \(dex.total) found"))
        } else {
            HomeWidgetSignedOut()
        }
    }

    /// A found critter in colour; one still to find as a silhouette.
    @ViewBuilder
    private func critter(_ name: String, found: Bool) -> some View {
        let art = Image(name).resizable().scaledToFit().frame(width: 34, height: 34)
        if found {
            art
        } else {
            art.colorMultiply(.black).opacity(0.45)
        }
    }
}
