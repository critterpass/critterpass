import SwiftUI
import WidgetKit

/// The left side of the StandBy pair (6.28): the guide asleep on a warm dark ground with a sun
/// glow and "z z z" in the guide's hand. No clock: StandBy draws its own beside it. The system
/// tints the whole widget red in night mode.
struct SleepyClockWidget: Widget {
    let kind = "CPStandByWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { _ in
            SleepyClockView()
                .containerBackground(for: .widget) { StandByPalette.leftGround }
        }
        .pushHandler(CPWidgetPushHandler.self)
        .configurationDisplayName("Sleepy clock")
        .description("A bedside friend for the night before an early start.")
        .supportedFamilies([.systemSmall])
    }
}

/// 6.28's night colours (warm darks and the dimmed tangerine figures have no tokens).
enum StandByPalette {
    static let leftGround = Color(red: 0x16 / 255, green: 0x11 / 255, blue: 0x0C / 255)
    static let rightGround = Color(red: 0x1A / 255, green: 0x0E / 255, blue: 0x0A / 255)
    static let numeral = Color(red: 0xFF / 255, green: 0x8A / 255, blue: 0x4D / 255)
    static let footer = Color(red: 0xE8 / 255, green: 0xA7 / 255, blue: 0x7A / 255)
}

struct SleepyClockView: View {
    var body: some View {
        ZStack {
            RadialGradient(
                colors: [LAPalette.orange.opacity(0.25), LAPalette.orange.opacity(0)],
                center: UnitPoint(x: 0.5, y: 0.6), startRadius: 0, endRadius: 90)
            Image("gecko-common-idle-color-48pt")
                .resizable()
                .scaledToFit()
                .frame(width: 84, height: 84)
                .offset(y: 8)
                .accessibilityHidden(true)
            Text(verbatim: "z z z")
                .font(.laGuide(13))
                .foregroundStyle(LAPalette.yellow.opacity(0.8))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .accessibilityHidden(true)
        }
    }
}
