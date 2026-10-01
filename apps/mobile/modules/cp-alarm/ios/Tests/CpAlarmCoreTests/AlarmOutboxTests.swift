import CpAppGroupStore
import CryptoKit
import Foundation
import XCTest

@testable import CpAlarmCore

final class AlarmOutboxTests: XCTestCase {
  private var root: URL!
  private let leaveById = "0192a4c1-7a3e-7d2b-9f10-3c4d5e6f7a8b"

  override func setUpWithError() throws {
    root = FileManager.default.temporaryDirectory
      .appendingPathComponent("cp-alarm-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: root)
  }

  private func queued(_ store: AppGroupStore) throws -> [PendingAction] {
    let data = Data(try store.pendingActionsText().utf8)
    return try JSONDecoder().decode(PendingActionsFile.self, from: data).actions
  }

  func testImUpQueuesSetReadinessFromTheAlarm() throws {
    let store = AppGroupStore(root: root)
    let at = ISO8601DateFormatter().date(from: "2026-10-02T19:00:07Z")!
    let action = try AlarmOutbox.record(.up(leaveById: leaveById), in: store, now: at)

    let entries = try queued(store)
    XCTAssertEqual(entries, [action])
    XCTAssertEqual(action.cmd, "set_readiness")
    XCTAssertEqual(action.via, .appIntent)
    XCTAssertEqual(action.scope, .readiness)
    XCTAssertEqual(action.v, 1)
    XCTAssertEqual(action.clientTs, "2026-10-02T19:00:07.000Z")
    XCTAssertEqual(
      action.payload,
      ["leave_by_id": .string(leaveById), "state": .string("up"), "source": .string("alarm")])
  }

  func testSnoozeQueuesTheDeviceCountAfterTheSnooze() throws {
    let store = AppGroupStore(root: root)
    try AlarmOutbox.record(.up(leaveById: leaveById), in: store)
    let snooze = try AlarmOutbox.record(.snooze(leaveById: leaveById, count: 1), in: store)

    let entries = try queued(store)
    XCTAssertEqual(entries.count, 2, "a queued command is never replaced")
    XCTAssertEqual(entries.last, snooze)
    XCTAssertEqual(snooze.cmd, "snooze_leave_by")
    XCTAssertEqual(snooze.scope, .tripDay)
    XCTAssertEqual(snooze.payload, ["leave_by_id": .string(leaveById), "count": .number(1)])

    let raw = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(try store.pendingActionsText().utf8))
        as? [String: Any])
    let last = try XCTUnwrap((raw["actions"] as? [[String: Any]])?.last)
    XCTAssertEqual((last["payload"] as? [String: Any])?["count"] as? Int, 1)
  }

  func testOpIdsAreVersionSevenAndTimeOrdered() {
    let pattern = try! NSRegularExpression(
      pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    let first = AlarmOutbox.uuidV7(now: Date(timeIntervalSince1970: 1_790_000_000))
    let second = AlarmOutbox.uuidV7(now: Date(timeIntervalSince1970: 1_790_000_001))
    for id in [first, second] {
      XCTAssertEqual(pattern.numberOfMatches(in: id, range: NSRange(id.startIndex..., in: id)), 1)
    }
    XCTAssertLessThan(first, second)
  }

  func testTheEventCarriesTheSnoozesUsedAfterTheTap() {
    let at = Date(timeIntervalSince1970: 1_790_000_000)
    let up = AlarmCommand.up(leaveById: leaveById).event(at: at, snoozeCount: 1)
    XCTAssertEqual(up["action"] as? String, "up")
    XCTAssertEqual(up["snoozeCount"] as? Int, 1)
    let snooze = AlarmCommand.snooze(leaveById: leaveById, count: 1).event(at: at, snoozeCount: 1)
    XCTAssertEqual(snooze["action"] as? String, "snooze")
    XCTAssertEqual(snooze["snoozeCount"] as? Int, 1)
    XCTAssertEqual(snooze["at"] as? String, "2026-09-21T14:13:20.000Z")
  }

  func testTheScheduleFileKeepsOneAlarmPerLeaveBy() throws {
    let store = AppGroupStore(root: root)
    let schedules = AlarmScheduleStore(store: store)
    let request = try AlarmRequest.from(AlarmPlanTests.request())
    try schedules.save(StoredAlarm(request: request, osAlarmId: "A"))
    try schedules.save(StoredAlarm(request: request.snoozed(at: Date()), osAlarmId: "B"))

    let all = try schedules.all()
    XCTAssertEqual(all.map(\.osAlarmId), ["B"])
    XCTAssertEqual(try schedules.alarm(osAlarmId: "B")?.request.snoozeCount, 1)
    XCTAssertNotEqual(StoredAlarm.hash(of: request), all[0].hash)
    XCTAssertEqual(try schedules.remove(leaveById: leaveById.uppercased())?.osAlarmId, "B")
    XCTAssertEqual(try schedules.all(), [])
  }

  func testThePostCarriesTheQueuedOpIdAndASignatureTheServerCanCheck() throws {
    let action = try AlarmOutbox.pendingAction(
      for: .up(leaveById: leaveById), opId: "0192a4c1-0000-7000-8000-000000000001",
      now: Date(timeIntervalSince1970: 1_790_000_000))
    let key = AlarmActionKey(
      keyId: "key-one", secret: "c2VjcmV0", scopes: ["readiness"], deviceId: "device-one", userId: "user-one")
    let now = Date(timeIntervalSince1970: 1_790_000_005)
    let request = try XCTUnwrap(
      AlarmActionPoster.request(
        for: action, key: key, apiBaseUrl: URL(string: "https://api.example.test")!, now: now))

    XCTAssertEqual(request.url?.absoluteString, "https://api.example.test/v1/actions")
    let body = try XCTUnwrap(request.httpBody)
    let envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
    XCTAssertEqual(envelope["op_id"] as? String, action.opId)
    XCTAssertEqual(envelope["cmd"] as? String, "set_readiness")
    XCTAssertEqual((envelope["actor"] as? [String: Any])?["via"] as? String, "app_intent")
    XCTAssertEqual((envelope["payload"] as? [String: Any])?["source"] as? String, "alarm")

    let digest = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
    let mac = HMAC<SHA256>.authenticationCode(
      for: Data("POST\n/v1/actions\n1790000005\n\(digest)".utf8),
      using: SymmetricKey(data: Data("c2VjcmV0".utf8)))
    let expected = Data(mac).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-CP-Sig"), expected)
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-CP-Ts"), "1790000005")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-CP-Key-Id"), "key-one")

    let snooze = try AlarmOutbox.pendingAction(for: .snooze(leaveById: leaveById, count: 1))
    XCTAssertNil(
      try AlarmActionPoster.request(
        for: snooze, key: key, apiBaseUrl: URL(string: "https://api.example.test")!),
      "a key without trip_day leaves the snooze to the app's drain")
  }

  func testOnlyAnHttpsEndpointIsUsed() throws {
    let store = AppGroupStore(root: root)
    try store.write(
      Data(#"{"schema":1,"api_base_url":"http://api.example.test"}"#.utf8),
      to: AppGroupStore.endpointsPath)
    XCTAssertNil(AlarmActionPoster.apiBaseUrl(store: store))
    try store.write(
      Data(#"{"schema":1,"api_base_url":"https://api.example.test"}"#.utf8),
      to: AppGroupStore.endpointsPath)
    XCTAssertEqual(AlarmActionPoster.apiBaseUrl(store: store)?.host, "api.example.test")
  }
}
