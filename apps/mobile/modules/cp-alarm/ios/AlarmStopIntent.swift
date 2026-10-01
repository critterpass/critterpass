import AppIntents
import Foundation

/// The alarm intents live in this static pod, not the app target: the app lists this package in
/// its own `AppIntentsPackage` (plugins/with-alarmkit.ts) so the system can run them.
public struct CpAlarmIntents: AppIntentsPackage {}

/// The ringing alarm's system stop button: "I'm up" (docs/api-contracts-async.md §4). AlarmKit
/// runs it in the app's process. It queues `set_readiness{up, source: alarm}` in the App Group
/// outbox, then tries `POST /v1/actions` with the device action key under the same `op_id`.
struct AlarmStopIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "I'm up"
  static let description = IntentDescription("Tells your crew you are up for the leave-by.")
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
    let snoozeCount = (try? schedules.alarm(leaveById: leaveById))?.request.snoozeCount ?? 0
    let command = AlarmCommand.up(leaveById: leaveById)
    let action = try AlarmOutbox.record(command, in: store)
    _ = try? schedules.remove(leaveById: leaveById)
    AlarmActionBroadcast.post(command.event(at: Date(), snoozeCount: snoozeCount))
    _ = await AlarmActionPoster.send(action, store: store)
    return .result()
  }
}
