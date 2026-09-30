import Foundation

/// The copy the native alarm shows, already in the reader's language (`NativeAlarmLabels`).
public struct AlarmLabels: Codable, Equatable, Sendable {
  public var imUp: String
  public var slide: String
  public var snooze: String
  public var snoozeNote: String
  public var crewPinged: String
}

/// `NativeAlarmRequest` from modules/cp-alarm/src/CpAlarmModule.ts, field for field. It is also
/// what `state/alarms.json` keeps per leave-by, so the snooze intent can ring again with the same
/// copy while the app is not running.
public struct AlarmRequest: Codable, Equatable, Sendable {
  public var leaveById: String
  public var tripId: String
  public var fireAt: String
  public var leaveAt: String
  public var title: String
  public var subtitle: String
  public var guideLine: String
  public var tintHex: String
  public var snoozeAllowed: Bool
  public var snoozeMinutes: Int
  public var snoozeCount: Int
  public var fullScreen: Bool
  public var labels: AlarmLabels

  /// Decodes the JS object the module receives.
  public static func from(_ object: [String: Any]) throws -> AlarmRequest {
    guard JSONSerialization.isValidJSONObject(object) else { throw AlarmPlanError.malformedRequest }
    let data = try JSONSerialization.data(withJSONObject: object)
    do {
      return try JSONDecoder().decode(AlarmRequest.self, from: data)
    } catch {
      throw AlarmPlanError.malformedRequest
    }
  }

  /// The request the one snooze rings with: `minutes` from `now`, the count moved on and no
  /// snooze button left.
  public func snoozed(at now: Date) -> AlarmRequest {
    var next = self
    next.fireAt = AlarmDates.format(now.addingTimeInterval(TimeInterval(snoozeMinutes * 60)))
    next.snoozeAllowed = false
    next.snoozeCount = snoozeCount + 1
    return next
  }
}

public enum AlarmPlanError: Error, Equatable, CustomStringConvertible {
  case malformedRequest
  case invalidLeaveById(String)
  case invalidDate(String)
  case invalidTint(String)
  case fireInPast(String)

  public var description: String {
    switch self {
    case .malformedRequest: return "The alarm request is missing a field or has the wrong type"
    case .invalidLeaveById(let id): return "\(id) is not a leave-by id"
    case .invalidDate(let value): return "\(value) is not an ISO 8601 time with an offset"
    case .invalidTint(let value): return "\(value) is not a #RRGGBB colour"
    case .fireInPast(let value): return "The alarm time \(value) has already passed"
    }
  }
}

/// A colour as 0…1 components, so the mapping stays testable without SwiftUI.
public struct AlarmTint: Equatable, Sendable {
  public let red: Double
  public let green: Double
  public let blue: Double

  public init?(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard digits.count == 6, digits.allSatisfy(\.isHexDigit), let value = UInt32(digits, radix: 16)
    else { return nil }
    red = Double((value >> 16) & 0xFF) / 255
    green = Double((value >> 8) & 0xFF) / 255
    blue = Double(value & 0xFF) / 255
  }
}

/// What AlarmKit is asked for: a fixed-date alarm whose stop button is "I'm up", with a snooze
/// button only while the one snooze is unused.
public struct AlarmPlan: Equatable, Sendable {
  public struct Snooze: Equatable, Sendable {
    public let label: String
    public let minutes: Int
    /// The count `snooze_leave_by` carries when this snooze is used.
    public let nextCount: Int
  }

  public let leaveById: String
  public let fireDate: Date
  public let leaveDate: Date
  public let title: String
  public let stopLabel: String
  public let tint: AlarmTint
  public let snooze: Snooze?

  public static func make(_ request: AlarmRequest, now: Date) throws -> AlarmPlan {
    guard UUID(uuidString: request.leaveById) != nil else {
      throw AlarmPlanError.invalidLeaveById(request.leaveById)
    }
    guard let fireDate = AlarmDates.parse(request.fireAt) else {
      throw AlarmPlanError.invalidDate(request.fireAt)
    }
    guard let leaveDate = AlarmDates.parse(request.leaveAt) else {
      throw AlarmPlanError.invalidDate(request.leaveAt)
    }
    guard let tint = AlarmTint(hex: request.tintHex) else {
      throw AlarmPlanError.invalidTint(request.tintHex)
    }
    guard fireDate > now else { throw AlarmPlanError.fireInPast(request.fireAt) }
    let snooze =
      request.snoozeAllowed && request.snoozeMinutes > 0
      ? Snooze(
        label: request.labels.snooze, minutes: request.snoozeMinutes,
        nextCount: request.snoozeCount + 1)
      : nil
    return AlarmPlan(
      leaveById: request.leaveById.lowercased(), fireDate: fireDate, leaveDate: leaveDate,
      title: request.title, stopLabel: request.labels.imUp, tint: tint, snooze: snooze)
  }
}

/// ISO 8601 with an offset, with or without fractional seconds (JS `toISOString` has them).
public enum AlarmDates {
  public static func parse(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) { return date }
    return ISO8601DateFormatter().date(from: value)
  }

  public static func format(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}
