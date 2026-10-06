import SwiftUI
import WidgetKit

/// The next-flight widget (5c-5, small), a Pass+ perk: flight, route, gate and the next time that
/// matters (boarding, else departure). Without Pass+ it shows what it would do and opens bookings.
struct NextFlightWidget: Widget {
    let kind = "CPNextFlightWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { entry in
            NextFlightView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
                .widgetURL(LADeepLink.url(route: "wallet/bookings"))
        }
        .pushHandler(CPWidgetPushHandler.self)
        .configurationDisplayName("Next flight")
        .description("Gate, seat and boarding time.")
        .supportedFamilies([.systemSmall])
    }
}

struct NextFlightView: View {
    let entry: HomeWidgetEntry

    var body: some View {
        if let file = entry.file {
            VStack(alignment: .leading, spacing: 3) {
                LAPill(tier: .passPlus)
                if file.isLocked("next_flight") {
                    Text("Your next flight, here")
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                    Text("Gate and boarding time at a glance with Pass+.")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                    Spacer(minLength: 0)
                } else if let face = FlightFace.make(file.snapshot.nextFlight, now: entry.date) {
                    Text(verbatim: [face.flight, face.gate.map { String(localized: "GATE \($0)") }]
                        .compactMap { $0 }.joined(separator: " · "))
                        .font(.laEyebrow)
                        .tracking(1)
                        .foregroundStyle(face.cancelled ? LAPalette.red : LAPalette.yellow)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(verbatim: face.route)
                        .font(.system(size: 20, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Spacer(minLength: 0)
                    next(face)
                } else {
                    Text("No flight coming up.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                    Spacer(minLength: 0)
                }
                HomeWidgetStaleLine(entry: entry)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            HomeWidgetSignedOut()
        }
    }

    @ViewBuilder
    private func next(_ face: FlightFace) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            switch face.next {
            case .boarding(let at):
                label("BOARDING")
                time(at)
            case .departs(let at):
                label("DEPARTS")
                time(at)
            case .departed:
                label(face.cancelled ? "CANCELLED" : "DEPARTED")
            }
            if let delay = face.delayMin {
                Text("+\(delay) min")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(LAPalette.orange)
            }
        }
    }

    private func label(_ text: LocalizedStringResource) -> some View {
        Text(text).font(.laLabel).tracking(0.8).foregroundStyle(LAPalette.muted)
    }

    private func time(_ at: Date) -> some View {
        Text(at, format: .dateTime.hour().minute())
            .font(.system(size: 24, weight: .heavy).monospacedDigit())
            .foregroundStyle(LAPalette.yellow)
    }
}
