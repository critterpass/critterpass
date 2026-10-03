import SwiftUI
import WidgetKit

/// The countdown widget (5c-1, small): "BALI IN 17 DAYS" on yellow with the guide's critter, one
/// fewer each local midnight (the digits roll); on the trip, "DAY 4". Free.
struct CountdownWidget: Widget {
    let kind = "CPCountdownWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CountdownProvider()) { entry in
            CountdownFamilyView(entry: entry)
                .widgetURL(LADeepLink.url(route: CountdownView.route(entry)))
        }
        .configurationDisplayName("Countdown")
        .description("Days until the trip, on your home screen.")
        .supportedFamilies([.systemSmall, .accessoryInline, .accessoryCircular])
    }
}

struct CountdownProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeWidgetEntry {
        HomeWidgetEntry(date: Date(), file: nil, pendingVote: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeWidgetEntry) -> Void) {
        completion(.now())
    }

    /// One entry now and one at each of the next days' local midnights, where the count changes.
    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) {
        let first = HomeWidgetEntry.now()
        let zone = first.file?.snapshot.trip?.tz.flatMap(TimeZone.init(identifier:)) ?? .current
        let nights = CountdownModel.midnights(after: first.date, count: 7, zone: zone)
        let entries = [first] + nights.map {
            HomeWidgetEntry(date: $0, file: first.file, pendingVote: nil)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// The home-screen card, or the lock-screen line and ring.
struct CountdownFamilyView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if family == .systemSmall {
            CountdownView(entry: entry)
                .containerBackground(for: .widget) {
                    entry.file == nil ? LAPalette.card : LAPalette.yellow
                }
        } else {
            CountdownAccessoryView(entry: entry, family: family)
                .containerBackground(for: .widget) { Color.clear }
        }
    }
}

struct CountdownView: View {
    let entry: HomeWidgetEntry

    static func route(_ entry: HomeWidgetEntry) -> String {
        entry.file?.snapshot.trip.map { "trips/\($0.id)" } ?? "trips"
    }

    var body: some View {
        if let file = entry.file {
            face(CountdownModel.face(snapshot: file.snapshot, now: entry.date))
        } else {
            HomeWidgetSignedOut()
        }
    }

    @ViewBuilder
    private func face(_ face: CountdownFace) -> some View {
        ZStack(alignment: .bottomTrailing) {
            Image("gecko-common-cheer-color-48pt")
                .resizable()
                .scaledToFit()
                .frame(width: 62, height: 62)
                .offset(x: 6, y: 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                switch face {
                case .daysTo(let place, let days):
                    eyebrow(place.map { "\($0.uppercased()) IN" } ?? String(localized: "TRIP IN"))
                    number(days)
                    Text(days == 1 ? "DAY" : "DAYS")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(LAPalette.night)
                case .onTrip(let place, let day):
                    eyebrow(place?.uppercased() ?? String(localized: "ON THE TRIP"))
                    Text("DAY")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(LAPalette.night)
                    number(day)
                case .noTrip:
                    eyebrow(String(localized: "NO TRIP YET"))
                    Text("Plan the next one with your crew.")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(LAPalette.night)
                }
                Spacer(minLength: 0)
                HomeWidgetStaleLine(entry: entry, ink: LAPalette.night.opacity(0.6))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private func eyebrow(_ text: String) -> some View {
        Text(verbatim: text)
            .font(.laEyebrow)
            .tracking(1.2)
            .foregroundStyle(LAPalette.night)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }

    private func number(_ value: Int) -> some View {
        Text("\(value)")
            .font(.system(size: 56, weight: .black).monospacedDigit())
            .foregroundStyle(LAPalette.night)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .contentTransition(.numericText(countsDown: true))
    }
}
