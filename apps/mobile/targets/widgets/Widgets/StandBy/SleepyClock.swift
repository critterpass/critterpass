import SwiftUI
import WidgetKit

/// The left side of the StandBy pair (5c-4): the time in big pink digits with the guide asleep
/// beside it. The system keeps the clock running and switches to red in night mode.
struct SleepyClockWidget: Widget {
    let kind = "CPStandByWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { _ in
            SleepyClockView()
                .containerBackground(for: .widget) { LAPalette.card }
        }
        .configurationDisplayName("Sleepy clock")
        .description("A bedside clock for the night before an early start.")
        .supportedFamilies([.systemSmall])
    }
}

struct SleepyClockView: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Text(Date.now, style: .time)
                .font(.system(size: 44, weight: .black).monospacedDigit())
                .foregroundStyle(LAPalette.pink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            Text(verbatim: "z z z")
                .font(.system(size: 11, weight: .heavy))
                .foregroundStyle(LAPalette.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            Image("gecko-common-idle-color-48pt")
                .resizable()
                .scaledToFit()
                .frame(width: 40, height: 40)
                .accessibilityHidden(true)
        }
    }
}
