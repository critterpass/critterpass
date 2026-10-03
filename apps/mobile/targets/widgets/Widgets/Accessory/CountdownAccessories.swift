import SwiftUI
import WidgetKit

/// The countdown on the lock screen (5c-3): one line above the clock ("Bali in 17 days"), or a
/// ring that fills over the last sixty days with "17D" and the place inside.
struct CountdownAccessoryView: View {
    let entry: HomeWidgetEntry
    let family: WidgetFamily

    var body: some View {
        let face = entry.file.map { CountdownModel.face(snapshot: $0.snapshot, now: entry.date) } ?? .noTrip
        if family == .accessoryInline {
            inline(face)
        } else {
            ring(face)
        }
    }

    @ViewBuilder
    private func inline(_ face: CountdownFace) -> some View {
        switch face {
        case .daysTo(let place, let days):
            if let place {
                Text("\(place) in \(days) days")
            } else {
                Text("Trip in \(days) days")
            }
        case .onTrip(let place, let day):
            Text(verbatim: [String(localized: "Day \(day)"), place].compactMap { $0 }.joined(separator: " · "))
        case .noTrip:
            Text("No trip yet")
        }
    }

    @ViewBuilder
    private func ring(_ face: CountdownFace) -> some View {
        let (value, place, fill): (String, String?, Double) = {
            switch face {
            case .daysTo(let place, let days):
                return ("\(days)D", place, AccessoryModel.countdownRing(days: days))
            case .onTrip(let place, let day):
                return (String(localized: "D\(day)"), place, 1)
            case .noTrip:
                return ("–", nil, 0)
            }
        }()
        Gauge(value: fill) {
            EmptyView()
        } currentValueLabel: {
            VStack(spacing: 0) {
                Text(verbatim: value)
                    .font(.system(size: 15, weight: .black))
                    .minimumScaleFactor(0.6)
                if let place {
                    Text(verbatim: place.uppercased())
                        .font(.system(size: 7, weight: .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
    }
}
