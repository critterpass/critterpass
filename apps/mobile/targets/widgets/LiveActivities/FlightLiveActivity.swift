import ActivityKit
import SwiftUI
import WidgetKit

/// The flight-day Live Activity (5a-3): flight number and gate, the route, and boarding, seat and
/// landing times; orange from ten minutes before boarding, red when cancelled or diverted; after
/// landing, the pickup (a booked transfer's name) or a ride hint. "from your email" only on
/// flights the mailbox imported.
struct FlightLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            FlightLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let tint = FlightLockScreen.tint(context.state.colour)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.from)
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.to)
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                }
                DynamicIslandExpandedRegion(.center) {
                    FlightEyebrow(attributes: context.attributes, state: context.state, tint: tint)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    FlightFacts(state: context.state, tint: tint)
                        .padding(.horizontal, 6)
                }
            } compactLeading: {
                Image(systemName: "airplane")
                    .foregroundStyle(tint)
            } compactTrailing: {
                FlightCompactTime(state: context.state, tint: tint)
            } minimal: {
                Image(systemName: "airplane")
                    .foregroundStyle(tint)
            }
            .keylineTint(tint)
        }
    }
}

struct FlightLockScreen: View {
    let attributes: FlightActivityAttributes
    let state: FlightActivityAttributes.ContentState

    static func tint(_ colour: LAFlightColour) -> Color {
        switch colour {
        case .orange: return LAPalette.orange
        case .red: return LAPalette.red
        case .default: return LAPalette.yellow
        }
    }

    var body: some View {
        let tint = Self.tint(state.colour)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                FlightEyebrow(attributes: attributes, state: state, tint: tint)
                // The flight is free to follow; finding it in the mailbox is the Pass+ part.
                if attributes.fromEmail { LAPill(tier: .passPlus) }
                Spacer(minLength: 6)
                if attributes.fromEmail {
                    Text("from your email")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                }
            }
            HStack(spacing: 10) {
                Text(attributes.from)
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(LAPalette.paper)
                ZStack {
                    LADashedLine()
                        .stroke(LAPalette.track, style: StrokeStyle(lineWidth: 2, dash: [4, 4]))
                        .frame(height: 20)
                    Image(systemName: "airplane")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(tint)
                        .padding(.horizontal, 6)
                        .background(LAPalette.card)
                }
                Text(attributes.to)
                    .font(.system(size: 34, weight: .black))
                    .foregroundStyle(LAPalette.paper)
            }
            if let pickup = state.pickup, state.phase == .landed || state.phase == .pickup {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pickup.name)
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(tint)
                    Text(pickup.line)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(LAPalette.paper)
                        .lineLimit(2)
                }
            } else if state.grabCta, state.phase == .landed || state.phase == .pickup {
                FlightRideHint(tint: tint)
            } else {
                FlightFacts(state: state, tint: tint)
            }
        }
        .padding(16)
        .widgetURL(
            state.grabCta && state.pickup == nil
                ? LADeepLink.url(route: "getting-around") : nil)
    }
}

struct FlightEyebrow: View {
    let attributes: FlightActivityAttributes
    let state: FlightActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        Text(line)
            .font(.laEyebrow)
            .tracking(1.2)
            .foregroundStyle(tint)
            .lineLimit(1)
    }

    private var line: String {
        var parts = [attributes.flightNo]
        switch state.phase {
        case .cancelled: parts.append(String(localized: "CANCELLED"))
        case .diverted: parts.append(String(localized: "DIVERTED"))
        case .landed, .pickup: parts.append(String(localized: "LANDED"))
        default:
            if let gate = state.gate { parts.append(String(localized: "GATE \(gate)")) }
            if let delay = state.delayMin, delay > 0 {
                parts.append(String(localized: "+\(delay) MIN"))
            }
        }
        return parts.joined(separator: " · ")
    }
}

/// BOARDING · SEAT · LANDS.
struct FlightFacts: View {
    let state: FlightActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        HStack(alignment: .top) {
            fact("BOARDING", state.boardingAt.map { Text($0.laDate, format: .dateTime.hour().minute()) })
            Spacer()
            fact("SEAT", state.seat.map { Text($0) })
            Spacer()
            fact("LANDS", state.arrAt.map { Text($0.laDate, format: .dateTime.hour().minute()) })
        }
    }

    private func fact(_ label: LocalizedStringResource, _ value: Text?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.laLabel)
                .tracking(0.8)
                .foregroundStyle(LAPalette.muted)
            (value ?? Text("—"))
                .font(.system(size: 18, weight: .heavy).monospacedDigit())
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .contentTransition(.numericText())
        }
    }
}

/// Time to boarding (or departure) in the compact island; the landing time once airborne.
private struct FlightCompactTime: View {
    let state: FlightActivityAttributes.ContentState
    let tint: Color

    var body: some View {
        let departs = (state.boardingAt ?? state.est ?? state.sched).laDate
        Group {
            if state.phase == .checkIn || state.phase == .boarding, departs > .now {
                Text(timerInterval: Date.now...departs, countsDown: true)
                    .frame(maxWidth: 52)
            } else if let arrives = state.arrAt {
                Text(arrives.laDate, format: .dateTime.hour().minute())
            } else {
                Text(state.sched.laDate, format: .dateTime.hour().minute())
            }
        }
        .font(.system(size: 14, weight: .heavy).monospacedDigit())
        .foregroundStyle(tint)
    }
}

/// Landed with no pickup booked: where to get a ride (the tap opens Getting around, which books
/// it in Grab).
struct FlightRideHint: View {
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("NO PICKUP BOOKED")
                .font(.laLabel)
                .tracking(0.8)
                .foregroundStyle(LAPalette.muted)
            Text("Tap for a Grab from the arrivals hall.")
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(tint)
                .lineLimit(2)
        }
    }
}
