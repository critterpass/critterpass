import SwiftUI
import WidgetKit

/// One entry of a home widget: the snapshot as it was at `date` (nil before the app has written
/// one) and any vote this phone tapped that the snapshot does not have yet.
struct HomeWidgetEntry: TimelineEntry {
    let date: Date
    let file: WidgetSnapshotFile?
    let pendingVote: PendingVote?

    static func now(_ date: Date = Date()) -> HomeWidgetEntry {
        let root = AppGroupContainer.url
        return HomeWidgetEntry(
            date: date, file: WidgetSnapshotFile.read(root: root),
            pendingVote: PendingVote.read(root: root, now: date))
    }
}

/// What a widget shows with no snapshot yet: the app has not run, or nobody is signed in.
struct HomeWidgetSignedOut: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("CRITTERPASS")
                .font(.laEyebrow)
                .tracking(1.2)
                .foregroundStyle(LAPalette.yellow)
            Text("Open the app to bring your trip here.")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(LAPalette.paper)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// "Updated 08:12" under a snapshot older than six hours.
struct HomeWidgetStaleLine: View {
    let entry: HomeWidgetEntry
    var ink: Color = LAPalette.muted

    var body: some View {
        if let file = entry.file, file.isStale(at: entry.date) {
            Text("Updated \(file.generatedAt, format: .dateTime.hour().minute())")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
        }
    }
}
