import SwiftUI
import WidgetKit

/// The next leave-by: on the home screen and in StandBy (small, 6.28 right) the minutes to leave
/// time as one big warm numeral, then the alarm once it is time; on the lock screen (5c-3, rectangular) one line
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

    /// 6.28 right: the warm dark night ground; the lock screen family draws on the system's.
    static func ground(_ entry: HomeWidgetEntry) -> Color {
        StandByPalette.rightGround
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
                Text("LEAVE-BY").font(.laEyebrow).tracking(0.66).foregroundStyle(LAPalette.orange)
                Text("Nothing early tomorrow. Sleep in.")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(StandByPalette.footer)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    @ViewBuilder
    private func face(leaveBy: WSNextLeaveBy, leaveAt: Date) -> some View {
        // StandBy scales a small widget about 2x: 6.28's 150 pt numeral is authored at 72.
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 0) {
                Text("LEAVE BY ")
                Text(leaveAt, format: .dateTime.hour().minute())
            }
            .font(.system(size: 11, weight: .bold))
            .tracking(0.66)
            .foregroundStyle(LAPalette.orange)
            switch LeaveByClockFace.make(leaveAt: leaveAt, now: entry.date) {
            case .minutes(let minutes):
                Text(verbatim: "\(min(max(minutes, 0), 99))")
                    .font(.system(size: 72, weight: .bold).monospacedDigit())
                    .tracking(-3.6)
                    .foregroundStyle(StandByPalette.numeral)
                    .contentTransition(.numericText(countsDown: true))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .accessibilityLabel(Text("\(minutes) minutes"))
                Text(verbatim: footer(String(localized: "minutes"), leaveBy.placeName))
                    .font(.system(size: 12))
                    .foregroundStyle(StandByPalette.footer)
                    .lineLimit(1)
            case .at(let time):
                Text(time, format: .dateTime.hour().minute())
                    .font(.system(size: 44, weight: .bold).monospacedDigit())
                    .tracking(-2.2)
                    .foregroundStyle(StandByPalette.numeral)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(verbatim: leaveBy.placeName ?? leaveBy.title)
                    .font(.system(size: 12))
                    .foregroundStyle(StandByPalette.footer)
                    .lineLimit(1)
            case .alarm:
                Image(systemName: "alarm.waves.left.and.right.fill")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(StandByPalette.numeral)
                Text("Time to go")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(StandByPalette.numeral)
                Text(verbatim: leaveBy.placeName ?? leaveBy.title)
                    .font(.system(size: 12))
                    .foregroundStyle(StandByPalette.footer)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func footer(_ unit: String, _ place: String?) -> String {
        [unit, place].compactMap { $0 }.joined(separator: " · ")
    }
}
