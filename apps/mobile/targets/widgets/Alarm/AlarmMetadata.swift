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

/// The alarm's colours: the StandBy night ground and warm figures (6.28 right), dark marks on the
/// tint.
enum AlarmPalette {
    static let ground = StandByPalette.rightGround
    static let night = CPPremium.light.colorOnAccent
    static let cream = StandByPalette.numeral
    static let muted = StandByPalette.footer
}

extension AlarmPresentationState.Mode {
    /// The snooze countdown's window, when the alarm is counting down to its next ring.
    var countdownWindow: ClosedRange<Date>? {
        guard case .countdown(let countdown) = self else { return nil }
        return countdown.startDate...max(countdown.startDate, countdown.fireDate)
    }
}
