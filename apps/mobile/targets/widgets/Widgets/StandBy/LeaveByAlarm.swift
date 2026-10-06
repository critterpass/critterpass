import SwiftUI
import WidgetKit

/// The next leave-by: on the home screen and in StandBy (5c-4, small) the minutes to leave time on
/// flip digits, then the alarm once it is time; on the lock screen (5c-3, rectangular) one line
/// with the leave time and where to be. Free.
struct NextLeaveByWidget: Widget {
    let kind = "CPNextLeaveByWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LeaveByMinuteProvider()) { entry in
            NextLeaveByView(entry: entry)
                .containerBackground(for: .widget) { NextLeaveByView.ground(entry) }
                .widgetURL(LADeepLink.url(route: entry.file?.snapshot.trip.map { "trips/\($0.id)" } ?? "trips"))
        }
        .pushHandler(CPWidgetPushHandler.self)
        .configurationDisplayName("Leave-by")
        .description("Minutes until it's time to go, for the nightstand.")
        .supportedFamilies([.systemSmall, .accessoryRectangular])
    }
}

/// One entry a minute through the last 100 minutes before leave time, then the alarm.
struct LeaveByMinuteProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeWidgetEntry {
        HomeWidgetEntry(date: Date(), file: nil, pendingVote: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeWidgetEntry) -> Void) {
        completion(.now())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) {
        WidgetSnapshotFetcher.afterRefresh(completion) { (completion: @escaping (Timeline<HomeWidgetEntry>) -> Void) in
            let first = HomeWidgetEntry.now()
            guard let leaveAt = WidgetDate.parse(first.file?.snapshot.nextLeaveBy?.leaveAt) else {
                completion(Timeline(entries: [first], policy: .never))
                return
            }
            let entries = LeaveByClockFace.entryDates(leaveAt: leaveAt, now: first.date).map {
                HomeWidgetEntry(date: $0, file: first.file, pendingVote: nil)
            }
            // After leave time the snapshot moves on to the next leave-by; look again in an hour.
            completion(Timeline(entries: entries, policy: .after(leaveAt.addingTimeInterval(3600))))
        }
    }
}

struct NextLeaveByView: View {
    let entry: HomeWidgetEntry
    @Environment(\.widgetFamily) private var family

    static func ground(_ entry: HomeWidgetEntry) -> Color {
        entry.file?.snapshot.nextLeaveBy == nil ? LAPalette.card : LAPalette.yellow
    }

    var body: some View {
        if let leaveBy = entry.file?.snapshot.nextLeaveBy, let leaveAt = WidgetDate.parse(leaveBy.leaveAt) {
            if family == .accessoryRectangular {
                NextLeaveByAccessory(leaveBy: leaveBy, leaveAt: leaveAt)
            } else {
                face(leaveBy: leaveBy, leaveAt: leaveAt)
            }
        } else if family == .accessoryRectangular {
            Text("No leave-by").font(.system(size: 13, weight: .semibold))
        } else if entry.file == nil {
            HomeWidgetSignedOut()
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("LEAVE-BY").font(.laEyebrow).tracking(1.2).foregroundStyle(LAPalette.yellow)
                Text("Nothing early tomorrow. Sleep in.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(LAPalette.paper)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    @ViewBuilder
    private func face(leaveBy: WSNextLeaveBy, leaveAt: Date) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 0) {
                Text("LEAVE BY ")
                Text(leaveAt, format: .dateTime.hour().minute())
            }
            .font(.laEyebrow)
            .tracking(1.2)
            .foregroundStyle(LAPalette.night)
            switch LeaveByClockFace.make(leaveAt: leaveAt, now: entry.date) {
            case .minutes(let minutes):
                FlipDigits(value: minutes)
                Text(verbatim: footer(String(localized: "minutes"), leaveBy.placeName))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.night)
                    .lineLimit(1)
            case .at(let time):
                Text(time, format: .dateTime.hour().minute())
                    .font(.system(size: 40, weight: .black).monospacedDigit())
                    .foregroundStyle(LAPalette.night)
                Text(verbatim: leaveBy.placeName ?? leaveBy.title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.night)
                    .lineLimit(1)
            case .alarm:
                Image(systemName: "alarm.waves.left.and.right.fill")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(LAPalette.night)
                Text("TIME TO GO")
                    .font(.system(size: 22, weight: .black))
                    .foregroundStyle(LAPalette.night)
                Text(verbatim: leaveBy.placeName ?? leaveBy.title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.night)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func footer(_ unit: String, _ place: String?) -> String {
        [unit, place].compactMap { $0 }.joined(separator: " · ")
    }
}

/// Two dark tiles with yellow digits, rolling on each minute.
struct FlipDigits: View {
    let value: Int

    var body: some View {
        let digits = Array(String(format: "%02d", min(max(value, 0), 99)))
        HStack(spacing: 4) {
            ForEach(Array(digits.enumerated()), id: \.offset) { _, digit in
                Text(String(digit))
                    .font(.system(size: 38, weight: .black).monospacedDigit())
                    .foregroundStyle(LAPalette.yellow)
                    .contentTransition(.numericText(countsDown: true))
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(LAPalette.card, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(Rectangle().fill(LAPalette.yellow.opacity(0.25)).frame(height: 1))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(value) minutes"))
    }
}
