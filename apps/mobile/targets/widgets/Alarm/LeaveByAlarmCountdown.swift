import AlarmKit
import SwiftUI
import WidgetKit

/// The leave-by alarm between its one snooze and the next ring: AlarmKit shows this Live
/// Activity (lock screen and Dynamic Island) while the snooze counts down. The ringing alert
/// itself is system-drawn, with "I'm up" as its stop button.
struct LeaveByAlarmCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<CPAlarmMetadata>.self) { context in
            LeaveByAlarmCountdownView(
                title: context.attributes.leaveByTitle,
                tint: context.attributes.tintColor,
                window: context.state.mode.countdownWindow
            )
            .activityBackgroundTint(AlarmPalette.night)
            .activitySystemActionForegroundColor(AlarmPalette.cream)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.fill")
                        .foregroundStyle(context.attributes.tintColor)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LeaveByAlarmTimer(window: context.state.mode.countdownWindow)
                        .font(.title3.monospacedDigit().weight(.bold))
                        .foregroundStyle(AlarmPalette.cream)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.leaveByTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AlarmPalette.muted)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "alarm.fill")
                    .foregroundStyle(context.attributes.tintColor)
            } compactTrailing: {
                LeaveByAlarmTimer(window: context.state.mode.countdownWindow)
                    .monospacedDigit()
                    .frame(maxWidth: 44)
                    .foregroundStyle(context.attributes.tintColor)
            } minimal: {
                Image(systemName: "alarm.fill")
                    .foregroundStyle(context.attributes.tintColor)
            }
            .keylineTint(context.attributes.tintColor)
        }
    }
}

/// Lock-screen face: the guide-tinted glow, the leave-by title and the time left in the snooze.
struct LeaveByAlarmCountdownView: View {
    let title: String
    let tint: Color
    let window: ClosedRange<Date>?

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.28))
                    .frame(width: 52, height: 52)
                    .blur(radius: 6)
                Circle()
                    .fill(tint)
                    .frame(width: 34, height: 34)
                Image(systemName: "alarm.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(AlarmPalette.night)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title.uppercased())
                    .font(.caption.weight(.heavy))
                    .tracking(1.2)
                    .foregroundStyle(tint)
                    .lineLimit(1)
                LeaveByAlarmTimer(window: window)
                    .font(.system(size: 40, weight: .black, design: .rounded).monospacedDigit())
                    .foregroundStyle(AlarmPalette.cream)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }
}

/// Counts down to the next ring; blank outside a countdown (AlarmKit only shows this activity
/// while counting down, so that is a transient state).
struct LeaveByAlarmTimer: View {
    let window: ClosedRange<Date>?

    var body: some View {
        if let window {
            Text(timerInterval: window, countsDown: true)
        } else {
            Text(verbatim: "")
        }
    }
}
