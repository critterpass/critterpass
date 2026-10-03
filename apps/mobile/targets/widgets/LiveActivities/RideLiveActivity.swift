import ActivityKit
import SwiftUI
import WidgetKit

/// The ride Live Activity: the Grab fare a member just checked for a leg, kept on the lock screen
/// with the pickup wait. It is a quote, never a trip in progress (there is no driver to follow),
/// and it says so once the quote is too old to trust. Tapping opens Getting around in the app,
/// where the ride is booked in Grab.
struct RideLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RideActivityAttributes.self) { context in
            RideLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(LAPalette.card)
                .activitySystemActionForegroundColor(LAPalette.paper)
                .widgetURL(LADeepLink.url(route: "getting-around"))
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    RideEyebrow(state: state)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RideWait(state: state)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    RideBody(attributes: context.attributes, state: state, fareSize: 20)
                        .padding(.horizontal, 10)
                }
            } compactLeading: {
                Image(systemName: "car.fill")
                    .foregroundStyle(LAPalette.green)
            } compactTrailing: {
                RideWait(state: state)
            } minimal: {
                Image(systemName: "car.fill")
                    .foregroundStyle(LAPalette.green)
            }
            .keylineTint(LAPalette.green)
            .widgetURL(LADeepLink.url(route: "getting-around"))
        }
    }
}

struct RideLockScreen: View {
    let attributes: RideActivityAttributes
    let state: RideActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                RideEyebrow(state: state)
                LAPill(tier: .free)
                Spacer(minLength: 6)
                RideWait(state: state)
            }
            RideBody(attributes: attributes, state: state, fareSize: 26)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

/// "GRAB · GRABCAR".
struct RideEyebrow: View {
    let state: RideActivityAttributes.ContentState

    var body: some View {
        LAEyebrow(
            text: Text(verbatim: "GRAB · \(state.serviceName.uppercased())"),
            tint: state.state == .expired ? LAPalette.muted : LAPalette.green)
    }
}

/// The pickup wait from the quote: "4 min away".
struct RideWait: View {
    let state: RideActivityAttributes.ContentState

    var body: some View {
        if state.state == .quoted {
            Text("\(state.etaMin) min away")
                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(LAPalette.muted)
                .lineLimit(1)
        }
    }
}

struct RideBody: View {
    let attributes: RideActivityAttributes
    let state: RideActivityAttributes.ContentState
    let fareSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(attributes.route)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(LAPalette.paper)
                .lineLimit(1)
            if state.state == .quoted {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(verbatim: RideFare.text(
                        low: state.fareLow, high: state.fareHigh, currency: state.currency))
                        .font(.system(size: fareSize, weight: .black).monospacedDigit())
                        .foregroundStyle(LAPalette.paper)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if state.surge {
                        Text("BUSY NOW")
                            .font(.laLabel)
                            .tracking(0.8)
                            .foregroundStyle(LAPalette.orange)
                    }
                }
                Text("Quoted at \(state.fetchedAt.laDate, format: .dateTime.hour().minute()). Tap to book in Grab.")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(LAPalette.muted)
                    .lineLimit(1)
            } else {
                Text("Fares move. Tap to check it again.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(LAPalette.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
