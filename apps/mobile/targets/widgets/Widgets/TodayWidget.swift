internal import AppIntents
import SwiftUI
import WidgetKit

/// The Today widget (5c-2, large): the day's briefing in order, finished items struck through and
/// faded, DONE or NUDGE on the ones that can be acted on from here, the guide at the foot. Free.
struct TodayWidget: Widget {
    let kind = "CPTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
        }
        .configurationDisplayName("Today")
        .description("The day's plan, with a tap to tick things off.")
        .supportedFamilies([.systemLarge])
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let file: WidgetSnapshotFile?
    let acted: Set<String>
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), file: nil, acted: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(Self.entry(Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = Self.entry(Date())
        let later = entry.file.map { $0.generatedAt.addingTimeInterval(WidgetSnapshotFile.staleAfter + 60) }
        completion(Timeline(entries: [entry], policy: later.map { .after($0) } ?? .never))
    }

    static func entry(_ date: Date) -> TodayEntry {
        let root = AppGroupContainer.url
        return TodayEntry(
            date: date, file: WidgetSnapshotFile.read(root: root),
            acted: PendingTodayItems.read(root: root).ids(at: date))
    }
}

struct TodayView: View {
    let entry: TodayEntry

    private static let bars = [LAPalette.green, LAPalette.blue, LAPalette.pink, LAPalette.orange, LAPalette.yellow]

    var body: some View {
        if let file = entry.file {
            let snapshot = file.snapshot
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: eyebrow(snapshot))
                        .font(.laEyebrow)
                        .tracking(1.2)
                        .foregroundStyle(LAPalette.yellow)
                        .lineLimit(1)
                    Text("TODAY")
                        .font(.system(size: 28, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                }
                if let face = TodayFace.make(today: snapshot.today, acted: entry.acted) {
                    ForEach(Array(face.rows.enumerated()), id: \.element.id) { index, row in
                        TodayRowView(row: row, bar: Self.bars[index % Self.bars.count])
                    }
                    if face.more > 0 {
                        Text("+\(face.more) more in the app")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(LAPalette.muted)
                    }
                } else {
                    Text(snapshot.trip == nil ? "No trip yet. Plan the next one with your crew." : "Nothing on today's plan yet.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                }
                Spacer(minLength: 0)
                HStack(alignment: .bottom) {
                    HomeWidgetStaleLine(entry: HomeWidgetEntry(date: entry.date, file: file, pendingVote: nil))
                    Spacer(minLength: 0)
                    Image("gecko-common-idle-color-48pt")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 52, height: 52)
                        .accessibilityHidden(true)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(LADeepLink.url(route: snapshot.trip.map { "trips/\($0.id)" } ?? "trips"))
        } else {
            HomeWidgetSignedOut()
        }
    }

    /// "DAY 4 · BALI" on the trip, else the place.
    private func eyebrow(_ snapshot: WidgetSnapshot) -> String {
        let place = snapshot.trip?.destination?.uppercased()
        if case .onTrip(_, let day) = CountdownModel.face(snapshot: snapshot, now: entry.date) {
            return [String(localized: "DAY \(day)"), place].compactMap { $0 }.joined(separator: " · ")
        }
        return place ?? String(localized: "YOUR DAY")
    }
}

struct TodayRowView: View {
    let row: TodayFace.Row
    let bar: Color

    var body: some View {
        HStack(spacing: 10) {
            Capsule()
                .fill(bar.opacity(row.finished ? 0.4 : 1))
                .frame(width: 4, height: 30)
            Text(row.text)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(row.finished ? LAPalette.muted : LAPalette.paper)
                .strikethrough(row.finished, color: LAPalette.muted)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let action = row.action {
                Button(intent: BriefingItemIntent(itemId: row.id, action: action)) {
                    Text(action == "nudge" ? "NUDGE" : "DONE")
                        .font(.system(size: 10, weight: .heavy))
                        .tracking(0.8)
                        .foregroundStyle(LAPalette.night)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(LAPalette.yellow, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity)
    }
}
