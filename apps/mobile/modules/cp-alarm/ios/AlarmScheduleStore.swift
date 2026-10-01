import CryptoKit
import Foundation

#if canImport(CpAppGroupStore)
  import CpAppGroupStore
#else
  import CpAppGroup
#endif

/// One alarm this device set, as `state/alarms.json` keeps it (docs/api-contracts-async.md §6:
/// leave-by → AlarmKit id and schedule hash). The request rides along so the snooze intent can
/// ring again with the same copy while the app is not running.
public struct StoredAlarm: Codable, Equatable, Sendable {
  public var leaveById: String
  public var osAlarmId: String
  public var fireAt: String
  public var hash: String
  public var request: AlarmRequest

  public init(request: AlarmRequest, osAlarmId: String) {
    self.leaveById = request.leaveById.lowercased()
    self.osAlarmId = osAlarmId
    self.fireAt = request.fireAt
    self.hash = Self.hash(of: request)
    self.request = request
  }

  enum CodingKeys: String, CodingKey {
    case leaveById = "leave_by_id"
    case osAlarmId = "os_alarm_id"
    case fireAt = "fire_at"
    case hash
    case request
  }

  /// SHA-256 over the request's sorted-key JSON: an unchanged request is not rescheduled.
  public static func hash(of request: AlarmRequest) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = (try? encoder.encode(request)) ?? Data()
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

/// `state/alarms.json`: written by the module and the alarm intents, read by both.
public struct AlarmScheduleStore: Sendable {
  public static let path = "state/alarms.json"
  static let schema = 1

  private let store: AppGroupStore
  private let now: @Sendable () -> Date

  public init(store: AppGroupStore, now: @escaping @Sendable () -> Date = { Date() }) {
    self.store = store
    self.now = now
  }

  public func all() throws -> [StoredAlarm] {
    guard let data = try store.read(Self.path) else { return [] }
    let file = try JSONDecoder().decode(AlarmsFile.self, from: data)
    guard file.schema == Self.schema else {
      throw AppGroupStoreError.unsupportedSchema(Self.path)
    }
    return file.alarms
  }

  public func alarm(leaveById: String) throws -> StoredAlarm? {
    try all().first { $0.leaveById == leaveById.lowercased() }
  }

  public func alarm(osAlarmId: String) throws -> StoredAlarm? {
    try all().first { $0.osAlarmId == osAlarmId }
  }

  /// Replaces any entry for the same leave-by.
  public func save(_ alarm: StoredAlarm) throws {
    try write(try all().filter { $0.leaveById != alarm.leaveById } + [alarm])
  }

  @discardableResult
  public func remove(leaveById: String) throws -> StoredAlarm? {
    let alarms = try all()
    let removed = alarms.first { $0.leaveById == leaveById.lowercased() }
    if removed != nil { try write(alarms.filter { $0.leaveById != leaveById.lowercased() }) }
    return removed
  }

  private func write(_ alarms: [StoredAlarm]) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let file = AlarmsFile(
      schema: Self.schema, generatedAt: AlarmDates.format(now()),
      alarms: alarms.sorted { $0.leaveById < $1.leaveById })
    try store.write(encoder.encode(file), to: Self.path)
  }
}

private struct AlarmsFile: Codable {
  let schema: Int
  let generatedAt: String
  let alarms: [StoredAlarm]

  enum CodingKeys: String, CodingKey {
    case schema
    case generatedAt = "generated_at"
    case alarms
  }
}
