import AppIntents
import Foundation

/// The ringing alarm's secondary button, present only while the one snooze is unused. It queues
/// `snooze_leave_by{count}` (the device's count after this snooze) and rings again after
/// `snoozeMinutes` as a countdown with no snooze button left.
struct AlarmSnoozeIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Snooze"
  static let description = IntentDescription("Snoozes the leave-by alarm once.")
  static let isDiscoverable = false

  @Parameter(title: "Leave-by")
  var leaveById: String

  init() {
    leaveById = ""
  }

  init(leaveById: String) {
    self.leaveById = leaveById
  }

  func perform() async throws -> some IntentResult {
    let (store, schedules) = try AlarmScheduler.scheduleStore()
    let stored = try schedules.alarm(leaveById: leaveById)
    let count = (stored?.request.snoozeCount ?? 0) + 1
    let command = AlarmCommand.snooze(leaveById: leaveById, count: count)
    let action = try AlarmOutbox.record(command, in: store)
    if let stored {
      _ = try await AlarmScheduler.snooze(stored)
    }
    AlarmActionBroadcast.post(command.event(at: Date(), snoozeCount: count))
    _ = await AlarmActionPoster.send(action, store: store)
    return .result()
  }
}
