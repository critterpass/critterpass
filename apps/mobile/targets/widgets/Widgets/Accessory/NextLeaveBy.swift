import SwiftUI
import WidgetKit

/// The next leave-by on the lock screen (5c-3, rectangular): the leave time, a countdown and
/// where to be, in the system tint.
struct NextLeaveByAccessory: View {
    let leaveBy: WSNextLeaveBy
    let leaveAt: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 0) {
                Text("LEAVE BY ")
                Text(leaveAt, format: .dateTime.hour().minute())
            }
            .font(.system(size: 11, weight: .heavy))
            .widgetAccentable()
            if leaveAt > .now {
                Text(timerInterval: Date.now...leaveAt, countsDown: true)
                    .font(.system(size: 18, weight: .black).monospacedDigit())
            } else {
                Text("TIME TO GO").font(.system(size: 18, weight: .black))
            }
            Text(verbatim: leaveBy.placeName ?? leaveBy.title)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
