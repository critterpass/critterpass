import AlarmKit
import Foundation

/// Metadata for the leave-by AlarmKit alarm (api-contracts-async.md §3.2, `Alarm` row): the
/// system renders the countdown/paused presentation itself, this only identifies which leave-by
/// the alarm belongs to so the widget extension's `ActivityConfiguration` can look up trail art.
struct CPAlarmMetadata: AlarmMetadata {
    let leaveById: String

    enum CodingKeys: String, CodingKey {
        case leaveById = "leave_by_id"
    }
}
