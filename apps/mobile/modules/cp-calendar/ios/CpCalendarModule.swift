import EventKit
import ExpoModulesCore
import Foundation

/// Date-level availability from the device's calendars (modules/cp-calendar/index.ts). Events are
/// read in-process and reduced to one free / maybe / busy per local date before anything returns:
/// only each event's start, end, all-day flag, availability and status are read, never its title,
/// notes, place, URL or people. Access is asked for by cp-permissions; without full access the
/// read rejects with `ERR_CALENDAR_ACCESS`.
public class CpCalendarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpCalendar")

    Function("hasAccess") { () -> Bool in
      EKEventStore.authorizationStatus(for: .event) == .fullAccess
    }

    AsyncFunction("readBusyDays") {
      (from: String, to: String, tz: String, includeTentative: Bool) throws -> [[String: Any]] in
      guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
        throw CalendarAccessException()
      }
      let zone = TimeZone(identifier: tz) ?? TimeZone.current
      let blocks = Self.blocks(from: from, to: to, zone: zone)
      return BusyDayReducer.reduce(
        blocks, from: from, to: to, timeZone: zone, includeTentative: includeTentative
      ).map(\.dictionary)
    }
  }

  private static func blocks(from: String, to: String, zone: TimeZone) -> [BusyBlock] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let parse: (String) -> Date? = { iso in
      let f = iso.split(separator: "-").compactMap { Int($0) }
      guard f.count == 3 else { return nil }
      return calendar.date(from: DateComponents(year: f[0], month: f[1], day: f[2]))
    }
    guard let start = parse(from), let last = parse(to),
      let end = calendar.date(byAdding: .day, value: 1, to: last)
    else { return [] }
    let store = EKEventStore()
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    return store.events(matching: predicate).compactMap { event in
      if event.status == .canceled { return nil }
      let kind: BlockKind
      switch event.availability {
      case .free:
        return nil
      case .tentative:
        kind = .tentative
      default:
        kind = event.status == .tentative ? .tentative : .busy
      }
      return BusyBlock(start: event.startDate, end: event.endDate, kind: kind, allDay: event.isAllDay)
    }
  }
}

final class CalendarAccessException: Exception, @unchecked Sendable {
  override var code: String { "ERR_CALENDAR_ACCESS" }
  override var reason: String { "Calendar full access is not granted" }
}
