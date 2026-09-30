import EventKit
import ExpoModulesCore
import Foundation

/// One plan item to add (modules/cp-calendar/index.ts `PlanCalendarEvent`).
struct PlanEventRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var startsAt: String = ""
  @Field var endsAt: String = ""
  @Field var tz: String = ""
  @Field var notes: String? = nil
}

/// Adds the member's plan items to their default calendar with write-only access (iOS 17+):
/// nothing is read back from the calendar, and each event links back to its plan item.
enum CalendarWriter {
  static func hasWriteAccess() -> Bool {
    let status = EKEventStore.authorizationStatus(for: .event)
    return status == .writeOnly || status == .fullAccess
  }

  /// Asks once; a refusal stays a refusal until the member changes it in Settings.
  static func requestAccess() async -> Bool {
    if hasWriteAccess() { return true }
    guard EKEventStore.authorizationStatus(for: .event) == .notDetermined else { return false }
    return (try? await EKEventStore().requestWriteOnlyAccessToEvents()) ?? false
  }

  static func write(_ records: [PlanEventRecord]) throws -> Int {
    guard hasWriteAccess() else { throw CalendarWriteAccessException() }
    let store = EKEventStore()
    guard let calendar = store.defaultCalendarForNewEvents else {
      throw CalendarWriteAccessException()
    }
    var written = 0
    for record in records {
      guard let start = instant(record.startsAt), let end = instant(record.endsAt), end > start
      else { continue }
      let event = EKEvent(eventStore: store)
      event.calendar = calendar
      event.title = record.title
      event.startDate = start
      event.endDate = end
      event.timeZone = TimeZone(identifier: record.tz)
      event.notes = record.notes
      event.url = URL(string: "critterpass://plan/item/\(record.id)")
      try store.save(event, span: .thisEvent, commit: false)
      written += 1
    }
    try store.commit()
    return written
  }

  private static func instant(_ iso: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
  }
}

final class CalendarWriteAccessException: Exception, @unchecked Sendable {
  override var code: String { "ERR_CALENDAR_WRITE" }
  override var reason: String { "Calendar write access is not granted" }
}
