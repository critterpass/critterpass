import Foundation

#if canImport(CpAppGroupStore)
  import CpAppGroupStore
#else
  import CpAppGroup
#endif

/// A tap on the ringing alarm, as the command it becomes (docs/api-contracts-async.md §4,
/// `AlarmStopIntent` / `AlarmSnoozeIntent`).
public enum AlarmCommand: Equatable, Sendable {
  /// `set_readiness{leave_by_id, state: up, source: alarm}`, action-key scope `readiness`.
  case up(leaveById: String)
  /// `snooze_leave_by{leave_by_id, count}`, action-key scope `trip_day`. `count` is the device's
  /// own count after this snooze.
  case snooze(leaveById: String, count: Int)

  public var name: String {
    switch self {
    case .up: return "set_readiness"
    case .snooze: return "snooze_leave_by"
    }
  }

  public var scope: PendingActionScope {
    switch self {
    case .up: return .readiness
    case .snooze: return .tripDay
    }
  }

  public var leaveById: String {
    switch self {
    case .up(let id), .snooze(let id, _): return id
    }
  }

  public var payload: [String: JSONValue] {
    switch self {
    case .up(let id):
      return ["leave_by_id": .string(id), "state": .string("up"), "source": .string("alarm")]
    case .snooze(let id, let count):
      return ["leave_by_id": .string(id), "count": .number(Double(count))]
    }
  }

  /// The `onAlarmAction` event body (`NativeAlarmAction`): snoozes used after this action, which
  /// is `snoozeCount` for "I'm up" and the snooze's own count for a snooze.
  public func event(at date: Date, snoozeCount: Int) -> [String: Any] {
    switch self {
    case .up(let id):
      return [
        "leaveById": id, "action": "up", "snoozeCount": snoozeCount, "at": AlarmDates.format(date),
      ]
    case .snooze(let id, let count):
      return [
        "leaveById": id, "action": "snooze", "snoozeCount": count, "at": AlarmDates.format(date),
      ]
    }
  }
}

/// Queues alarm commands in the App Group outbox (`state/pending-actions.json`), which the app
/// drains into its own upload queue with the same `op_id` and `via`.
public enum AlarmOutbox {
  /// The system alarm's buttons run App Intents in the app's process.
  public static let via = PendingActionVia.appIntent

  public static func pendingAction(
    for command: AlarmCommand, opId: String = uuidV7(), now: Date = Date()
  ) throws -> PendingAction {
    // The generated type has no public initializer: it is built from its own wire shape.
    let entry = Entry(
      opId: opId, cmd: command.name, v: PendingAction.vValue, via: via, scope: command.scope,
      clientTs: AlarmDates.format(now), payload: command.payload)
    return try JSONDecoder().decode(PendingAction.self, from: JSONEncoder().encode(entry))
  }

  /// Appends the command and returns the queued entry (its `op_id` is reused if the intent also
  /// reaches `POST /v1/actions` itself, so the server applies it once).
  @discardableResult
  public static func record(
    _ command: AlarmCommand, in store: AppGroupStore, now: Date = Date()
  ) throws -> PendingAction {
    let action = try pendingAction(for: command, now: now)
    try store.appendPendingAction(action)
    return action
  }

  /// A time-ordered UUIDv7 (RFC 9562): the server only accepts v7 `op_id`s.
  public static func uuidV7(now: Date = Date()) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let millis = UInt64(now.timeIntervalSince1970 * 1000)
    for index in 0..<6 {
      bytes[index] = UInt8(truncatingIfNeeded: millis >> (8 * (5 - index)))
    }
    for index in 6..<16 {
      bytes[index] = UInt8.random(in: 0...255)
    }
    bytes[6] = (bytes[6] & 0x0F) | 0x70
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    let groups = [(0, 8), (8, 4), (12, 4), (16, 4), (20, 12)].map { start, length in
      String(hex.dropFirst(start).prefix(length))
    }
    return groups.joined(separator: "-")
  }
}

private struct Entry: Encodable {
  let opId: String
  let cmd: String
  let v: Int
  let via: PendingActionVia
  let scope: PendingActionScope
  let clientTs: String
  let payload: [String: JSONValue]

  enum CodingKeys: String, CodingKey {
    case opId = "op_id"
    case cmd
    case v
    case via
    case scope
    case clientTs = "client_ts"
    case payload
  }
}
