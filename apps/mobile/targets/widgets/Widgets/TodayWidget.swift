internal import AppIntents
import SwiftUI
import WidgetKit

/// The Today widget (large, 6.31): the day's plan in order, finished items struck through and
/// faded, "Done" or "Nudge" on the ones that can be acted on from here, the packing still to tick,
/// the guide's line at the foot. Free.
struct TodayWidget: Widget {
    let kind = "CPTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            TodayView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
        }
        .pushHandler(CPWidgetPushHandler.self)
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

    /// One entry now and one at each moment a stop falls behind, so strikes appear on time.
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        WidgetSnapshotFetcher.afterRefresh(completion) { (completion: @escaping (Timeline<TodayEntry>) -> Void) in
            let entry = Self.entry(Date())
            let changes = TodayFace.changes(today: entry.file?.snapshot.today, after: entry.date)
            let entries = [entry] + changes.map { TodayEntry(date: $0, file: entry.file, acted: entry.acted) }
            let later = entry.file.map { $0.generatedAt.addingTimeInterval(WidgetSnapshotFile.staleAfter + 60) }
            completion(Timeline(entries: entries, policy: later.map { .after($0) } ?? .atEnd))
        }
    }

    static func entry(_ date: Date) -> TodayEntry {
        let root = AppGroupContainer.url
        return TodayEntry(
            date: date, file: WidgetSnapshotFile.read(root: root),
            acted: WidgetTaps.read(root: root).ids(at: date))
    }
}

struct TodayView: View {
    let entry: TodayEntry

    private static let bars = [LAPalette.green, LAPalette.blue, LAPalette.pink, LAPalette.orange, LAPalette.yellow]

    var body: some View {
        if let file = entry.file {
            let snapshot = file.snapshot
            let face = TodayFace.make(today: snapshot.today, now: entry.date, acted: entry.acted)
            // 6.31: the eyebrow and "Today" with the high on the right, the plan rows (time, the
            // item's colour bar, title), then the guide's line over a hairline.
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(verbatim: eyebrow(snapshot))
                            .font(.system(size: 12, weight: .bold))
                            .tracking(0.48)
                            .foregroundStyle(LAPalette.muted)
                            .lineLimit(1)
                        Text("Today")
                            .font(.system(size: 30, weight: .heavy))
                            .tracking(-1.2)
                            .foregroundStyle(LAPalette.paper)
                    }
                    Spacer(minLength: 8)
                    if let forecast = face?.forecast { TodayTempChip(forecast: forecast) }
                }
                if let face, !face.rows.isEmpty || !face.packing.isEmpty {
                    ForEach(Array(face.rows.enumerated()), id: \.element.id) { index, row in
                        TodayRowView(row: row, bar: Self.bars[index % Self.bars.count])
                    }
                    if face.more > 0 {
                        Text("+\(face.more) more in the app")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(LAPalette.muted)
                    }
                    TodayPackingRow(packing: face.packing)
                } else {
                    Text(snapshot.trip == nil ? "No trip yet. Plan the next one with your crew." : "Nothing on today's plan yet.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                }
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 8) {
                    Rectangle().fill(LAPalette.hairline).frame(height: 0.5)
                    HStack(alignment: .center, spacing: 10) {
                        Image("gecko-common-idle-color-48pt")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 34, height: 34)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            if let forecast = face?.forecast { TodayForecastLine(forecast: forecast) }
                            HomeWidgetStaleLine(entry: HomeWidgetEntry(date: entry.date, file: file, pendingVote: nil))
                        }
                        Spacer(minLength: 0)
                    }
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
            Group {
                if let at = row.at {
                    Text(at, format: .dateTime.hour().minute())
                } else {
                    Text(verbatim: "")
                }
            }
            .font(.system(size: 13.5, weight: .bold).monospacedDigit())
            .foregroundStyle(row.finished ? LAPalette.muted : LAPalette.paper)
            .frame(width: 44, alignment: .leading)
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(bar.opacity(row.finished ? 0.4 : 1))
                .frame(width: 4, height: 28)
            Text(row.text)
                .font(.system(size: 14.5, weight: .semibold))
                .foregroundStyle(row.finished ? LAPalette.muted : LAPalette.paper)
                .strikethrough(row.finished, color: LAPalette.muted)
                .lineLimit(row.at == nil ? 2 : 1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let action = row.action {
                Button(intent: BriefingItemIntent(itemId: row.id, action: action)) {
                    Text(action == "nudge" ? "Nudge" : "Done")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(LAPalette.card)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 26)
                        .background(LAPalette.paper, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .transition(.opacity)
    }
}

/// The packing still to tick, as small checkable chips (ticked ones fade out of the row).
struct TodayPackingRow: View {
    let packing: [TodayFace.Pack]

    var body: some View {
        let open = packing.filter { !$0.checked }.prefix(3)
        if !open.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "bag")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.muted)
                    .accessibilityHidden(true)
                ForEach(Array(open), id: \.id) { item in
                    Button(intent: PackingCheckIntent(itemId: item.id)) {
                        HStack(spacing: 4) {
                            Image(systemName: "circle")
                                .font(.system(size: 10, weight: .bold))
                            Text(item.label).lineLimit(1)
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(LAPalette.paper)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(LAPalette.chip, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// The day's high beside the title ("31°").
struct TodayTempChip: View {
    let forecast: Forecast

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: Self.symbol(forecast.line))
                .symbolRenderingMode(.multicolor)
                .font(.system(size: 24))
                .frame(width: 28, height: 28)
            Text(verbatim: "\(forecast.highC)°")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(LAPalette.paper)
        }
    }

    static func symbol(_ line: Forecast.Line) -> String {
        switch line {
        case .rainFrom, .rainNow: return "cloud.rain.fill"
        case .storm: return "cloud.bolt.rain.fill"
        case .cloudy: return "cloud.fill"
        case .dry: return "sun.max.fill"
        }
    }
}

/// The guide's forecast line at the foot ("Rain after 14:00.").
struct TodayForecastLine: View {
    let forecast: Forecast

    var body: some View {
        line
            .font(.system(size: 12.5))
            .foregroundStyle(LAPalette.secondary)
            .lineLimit(2)
    }

    private var line: Text {
        switch forecast.line {
        case .rainFrom(let at): return Text("Rain after \(at.formatted(.dateTime.hour().minute())).")
        case .rainNow: return Text("Rain on and off. Keep a jacket handy.")
        case .storm: return Text("Storms around. Stay near shelter.")
        case .cloudy: return Text("Cloudy, dry. Good walking weather.")
        case .dry: return Text("Dry all day. Sunscreen.")
        }
    }
}
