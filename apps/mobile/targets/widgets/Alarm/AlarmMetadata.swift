import AlarmKit
import SwiftUI

/// What the leave-by alarm's Live Activity reads from AlarmKit's attributes. `CPAlarmMetadata`
/// itself is declared once in `targets/_shared/CPAlarmMetadata.swift`; modules/cp-alarm declares
/// the same name and coding keys on the app side, which is how ActivityKit pairs the two.
extension AlarmAttributes where Metadata == CPAlarmMetadata {
    /// "Leave by 03:10 · Batur": the countdown's own title, else the alert's.
    var leaveByTitle: String {
        String(localized: presentation.countdown?.title ?? presentation.alert.title)
    }
}

/// Design tokens the alarm views use (packages/design-tokens `color.*`), as SwiftUI colours.
enum AlarmPalette {
    static let night = Color(red: 0x0D / 255, green: 0x0B / 255, blue: 0x18 / 255)
    static let cream = Color(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE4 / 255)
    static let muted = Color(red: 0xA9 / 255, green: 0xA3 / 255, blue: 0xC0 / 255)
}

extension AlarmPresentationState.Mode {
    /// The snooze countdown's window, when the alarm is counting down to its next ring.
    var countdownWindow: ClosedRange<Date>? {
        guard case .countdown(let countdown) = self else { return nil }
        return countdown.startDate...max(countdown.startDate, countdown.fireDate)
    }
}
