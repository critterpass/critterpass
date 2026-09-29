import Foundation

/// How a calendar block counts toward a day: busy time, or tentative time ("maybe busy" only when
/// the member opted in). Free and cancelled blocks never reach the reducer.
public enum BlockKind: Sendable, Equatable {
  case busy
  case tentative
}

/// One calendar block reduced to what the day count needs: when it starts and ends, and whether
/// it is all-day. Nothing else about the event is ever read.
public struct BusyBlock: Sendable, Equatable {
  public let start: Date
  public let end: Date
  public let kind: BlockKind
  public let allDay: Bool

  public init(start: Date, end: Date, kind: BlockKind, allDay: Bool) {
    self.start = start
    self.end = end
    self.kind = kind
    self.allDay = allDay
  }
}

/// One date's state as it leaves the device: the local date and free / maybe / busy, nothing more.
public struct DayState: Sendable, Equatable {
  public let date: String
  public let state: String

  public init(date: String, state: String) {
    self.date = date
    self.state = state
  }

  public var dictionary: [String: Any] { ["date": date, "state": state] }
}

/// The same reduction the server runs (`reduceToDays` in packages/domain/src/setup/calendar.ts):
/// per local date, only the waking hours 08:00–22:00 count; a day is busy with an all-day busy
/// block or at least three busy hours, maybe (opt-in) with an all-day tentative block or at least
/// three tentative hours, otherwise free.
public enum BusyDayReducer {
  public static let minBusyMinutes: Double = 180
  static let wakingStartHour = 8
  static let wakingEndHour = 22

  /// Every local date from `from` to `to` (inclusive, `YYYY-MM-DD`) in `timeZone`.
  public static func reduce(
    _ blocks: [BusyBlock], from: String, to: String, timeZone: TimeZone, includeTentative: Bool
  ) -> [DayState] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    guard let first = day(from, calendar), let last = day(to, calendar), first <= last else {
      return []
    }
    var result: [DayState] = []
    var cursor = first
    while cursor <= last {
      let parts = calendar.dateComponents([.year, .month, .day], from: cursor)
      let state = stateOf(parts, blocks: blocks, calendar: calendar, includeTentative: includeTentative)
      result.append(DayState(date: format(parts), state: state))
      guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }
      cursor = next
    }
    return result
  }

  private static func stateOf(
    _ parts: DateComponents, blocks: [BusyBlock], calendar: Calendar, includeTentative: Bool
  ) -> String {
    guard let start = at(parts, hour: wakingStartHour, calendar),
      let end = at(parts, hour: wakingEndHour, calendar)
    else { return "free" }
    var busy = 0.0
    var tentative = 0.0
    var allDayBusy = false
    var allDayTentative = false
    for block in blocks {
      let minutes = max(0, min(end, block.end).timeIntervalSince(max(start, block.start))) / 60
      if minutes <= 0 { continue }
      switch block.kind {
      case .busy:
        busy += minutes
        allDayBusy = allDayBusy || block.allDay
      case .tentative:
        tentative += minutes
        allDayTentative = allDayTentative || block.allDay
      }
    }
    if allDayBusy || busy >= minBusyMinutes { return "busy" }
    if includeTentative && (allDayTentative || tentative >= minBusyMinutes) { return "maybe" }
    return "free"
  }

  private static func day(_ iso: String, _ calendar: Calendar) -> Date? {
    let fields = iso.split(separator: "-").compactMap { Int($0) }
    guard fields.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: fields[0], month: fields[1], day: fields[2]))
  }

  private static func at(_ parts: DateComponents, hour: Int, _ calendar: Calendar) -> Date? {
    var components = parts
    components.hour = hour
    return calendar.date(from: components)
  }

  private static func format(_ parts: DateComponents) -> String {
    String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }
}
