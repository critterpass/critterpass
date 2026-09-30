import ActivityKit
import AlarmKit
import Foundation
import SwiftUI

#if canImport(CpAppGroupStore)
  import CpAppGroupStore
#else
  import CpAppGroup
#endif

/// Identifies which leave-by an AlarmKit alarm belongs to. ActivityKit matches the countdown
/// presentation by type name, so the name and coding keys must stay equal to
/// `targets/_shared/CPAlarmMetadata.swift`, which the widget extension's alarm views decode.
struct CPAlarmMetadata: AlarmMetadata {
  let leaveById: String

  enum CodingKeys: String, CodingKey {
    case leaveById = "leave_by_id"
  }
}

enum AlarmSchedulerError: Error, CustomStringConvertible {
  case noAppGroup
  case notAuthorized

  var description: String {
    switch self {
    case .noAppGroup: return "The App Group container is missing (entitlement not set)"
    case .notAuthorized: return "AlarmKit is not authorized"
    }
  }
}

/// AlarmKit on behalf of the module and the alarm intents: a fixed-date alarm whose stop button
/// is "I'm up", its snooze secondary button while the one snooze is unused, and the snooze
/// itself as a countdown that rings again with no secondary button.
enum AlarmScheduler {
  static func scheduleStore() throws -> (AppGroupStore, AlarmScheduleStore) {
    guard let store = AppGroupStore.shared() else { throw AlarmSchedulerError.noAppGroup }
    return (store, AlarmScheduleStore(store: store))
  }

  /// Sets (or replaces) the alarm for `request.leaveById`; an unchanged request that is still set
  /// is left alone.
  static func schedule(_ request: AlarmRequest, now: Date = Date()) async throws -> StoredAlarm {
    guard AlarmManager.shared.authorizationState == .authorized else {
      throw AlarmSchedulerError.notAuthorized
    }
    let plan = try AlarmPlan.make(request, now: now)
    let (_, schedules) = try scheduleStore()
    let live = Set(try AlarmManager.shared.alarms.map(\.id.uuidString))
    if let existing = try schedules.alarm(leaveById: plan.leaveById) {
      if existing.hash == StoredAlarm.hash(of: request), live.contains(existing.osAlarmId) {
        return existing
      }
      cancelQuietly(existing.osAlarmId)
    }
    let id = UUID()
    let configuration = AlarmManager.AlarmConfiguration<CPAlarmMetadata>.alarm(
      schedule: .fixed(plan.fireDate),
      attributes: attributes(plan, countdown: false),
      stopIntent: AlarmStopIntent(leaveById: plan.leaveById),
      secondaryIntent: plan.snooze.map { _ in AlarmSnoozeIntent(leaveById: plan.leaveById) })
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    let stored = StoredAlarm(request: request, osAlarmId: id.uuidString)
    try schedules.save(stored)
    return stored
  }

  /// The one snooze: a countdown of `snoozeMinutes` (shown by the widget extension's alarm
  /// presentation) that rings again with no snooze button.
  static func snooze(_ stored: StoredAlarm, now: Date = Date()) async throws -> StoredAlarm {
    let next = stored.request.snoozed(at: now)
    let plan = try AlarmPlan.make(next, now: now)
    let (_, schedules) = try scheduleStore()
    cancelQuietly(stored.osAlarmId)
    let id = UUID()
    let configuration = AlarmManager.AlarmConfiguration<CPAlarmMetadata>(
      countdownDuration: .init(preAlert: TimeInterval(stored.request.snoozeMinutes * 60), postAlert: nil),
      attributes: attributes(plan, countdown: true),
      stopIntent: AlarmStopIntent(leaveById: plan.leaveById))
    _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
    let saved = StoredAlarm(request: next, osAlarmId: id.uuidString)
    try schedules.save(saved)
    return saved
  }

  static func cancel(leaveById: String) throws {
    let (_, schedules) = try scheduleStore()
    if let removed = try schedules.remove(leaveById: leaveById) {
      cancelQuietly(removed.osAlarmId)
    }
  }

  /// Every alarm this device set that AlarmKit still holds, with its current state.
  static func list() throws -> [[String: Any]] {
    let (_, schedules) = try scheduleStore()
    let states = Dictionary(
      try AlarmManager.shared.alarms.map { ($0.id.uuidString, $0.state) },
      uniquingKeysWith: { first, _ in first })
    return try schedules.all().compactMap { stored in
      guard let state = states[stored.osAlarmId] else { return nil }
      return [
        "leaveById": stored.leaveById, "osAlarmId": stored.osAlarmId, "fireAt": stored.fireAt,
        "state": wireState(state),
      ]
    }
  }

  static func wireState(_ state: Alarm.State) -> String {
    switch state {
    case .alerting: return "alerting"
    case .countdown, .paused: return "snoozed"
    default: return "scheduled"
    }
  }

  private static func cancelQuietly(_ osAlarmId: String) {
    guard let id = UUID(uuidString: osAlarmId) else { return }
    try? AlarmManager.shared.cancel(id: id)
  }

  private static func attributes(_ plan: AlarmPlan, countdown: Bool) -> AlarmAttributes<
    CPAlarmMetadata
  > {
    let title = LocalizedStringResource(stringLiteral: plan.title)
    let secondary = plan.snooze.map { snooze in
      AlarmButton(
        text: LocalizedStringResource(stringLiteral: snooze.label), textColor: .white,
        systemImageName: "zzz")
    }
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = AlarmPresentation.Alert(
        title: title, secondaryButton: secondary,
        secondaryButtonBehavior: secondary == nil ? nil : .custom)
    } else {
      alert = AlarmPresentation.Alert(
        title: title,
        stopButton: AlarmButton(
          text: LocalizedStringResource(stringLiteral: plan.stopLabel), textColor: .white,
          systemImageName: "sun.max.fill"),
        secondaryButton: secondary, secondaryButtonBehavior: secondary == nil ? nil : .custom)
    }
    let presentation = AlarmPresentation(
      alert: alert, countdown: countdown ? AlarmPresentation.Countdown(title: title) : nil)
    return AlarmAttributes(
      presentation: presentation, metadata: CPAlarmMetadata(leaveById: plan.leaveById),
      tintColor: Color(red: plan.tint.red, green: plan.tint.green, blue: plan.tint.blue))
  }
}

/// In-process hand-off from the alarm intents to the module's `onAlarmAction` event.
enum AlarmActionBroadcast {
  static let name = Notification.Name("app.critterpass.alarm.action")

  static func post(_ event: [String: Any]) {
    NotificationCenter.default.post(name: name, object: nil, userInfo: event)
  }
}
