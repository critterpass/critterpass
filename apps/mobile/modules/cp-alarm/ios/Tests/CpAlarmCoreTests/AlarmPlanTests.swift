import Foundation
import XCTest

@testable import CpAlarmCore

final class AlarmPlanTests: XCTestCase {
  static let now = ISO8601DateFormatter().date(from: "2026-10-02T18:00:00Z")!

  static func request(_ change: (inout [String: Any]) -> Void = { _ in }) -> [String: Any] {
    var object: [String: Any] = [
      "leaveById": "0192a4c1-7a3e-7d2b-9f10-3c4d5e6f7a8b",
      "tripId": "0192a4c1-7a3e-7d2b-9f10-000000000001",
      "fireAt": "2026-10-03T03:00:00.000+08:00",
      "leaveAt": "2026-10-03T03:10:00+08:00",
      "title": "Leave by 03:10 · Batur",
      "subtitle": "Pickup at the villa gate · Made is outside",
      "guideLine": "The sun won't wait. Neither will Made. Up!",
      "tintHex": "#F2A33A",
      "snoozeAllowed": true,
      "snoozeMinutes": 5,
      "snoozeCount": 0,
      "fullScreen": false,
      "labels": [
        "imUp": "I'm up", "slide": "Slide, I'm up", "snooze": "Snooze 5 min",
        "snoozeNote": "(Tokek will sigh)", "crewPinged": "Crew was pinged",
      ],
    ]
    change(&object)
    return object
  }

  func testMapsTheRequestToAFixedDateAlarmWithSnooze() throws {
    let plan = try AlarmPlan.make(AlarmRequest.from(Self.request()), now: Self.now)
    XCTAssertEqual(plan.fireDate, ISO8601DateFormatter().date(from: "2026-10-02T19:00:00Z"))
    XCTAssertEqual(plan.leaveDate, ISO8601DateFormatter().date(from: "2026-10-02T19:10:00Z"))
    XCTAssertEqual(plan.title, "Leave by 03:10 · Batur")
    XCTAssertEqual(plan.stopLabel, "I'm up")
    XCTAssertEqual(plan.snooze, AlarmPlan.Snooze(label: "Snooze 5 min", minutes: 5, nextCount: 1))
    XCTAssertEqual(plan.tint.red, 242.0 / 255, accuracy: 0.0001)
    XCTAssertEqual(plan.tint.green, 163.0 / 255, accuracy: 0.0001)
    XCTAssertEqual(plan.tint.blue, 58.0 / 255, accuracy: 0.0001)
  }

  func testHasNoSnoozeButtonOnceTheSnoozeIsUsed() throws {
    let used = try AlarmRequest.from(Self.request { $0["snoozeAllowed"] = false })
    XCTAssertNil(try AlarmPlan.make(used, now: Self.now).snooze)
  }

  func testTheSnoozeRingsAgainAfterItsMinutesWithoutASecondSnooze() throws {
    let request = try AlarmRequest.from(Self.request())
    let later = Self.now.addingTimeInterval(3600)
    let snoozed = request.snoozed(at: later)
    XCTAssertEqual(AlarmDates.parse(snoozed.fireAt), later.addingTimeInterval(300))
    XCTAssertEqual(snoozed.snoozeCount, 1)
    XCTAssertFalse(snoozed.snoozeAllowed)
    XCTAssertNil(try AlarmPlan.make(snoozed, now: later).snooze)
    XCTAssertEqual(snoozed.leaveAt, request.leaveAt)
  }

  func testRejectsWhatAlarmKitCannotRing() throws {
    let past = try AlarmRequest.from(Self.request { $0["fireAt"] = "2026-10-02T17:59:00Z" })
    XCTAssertThrowsError(try AlarmPlan.make(past, now: Self.now)) { error in
      XCTAssertEqual(error as? AlarmPlanError, .fireInPast("2026-10-02T17:59:00Z"))
    }
    let tint = try AlarmRequest.from(Self.request { $0["tintHex"] = "orange" })
    XCTAssertThrowsError(try AlarmPlan.make(tint, now: Self.now))
    let id = try AlarmRequest.from(Self.request { $0["leaveById"] = "batur" })
    XCTAssertThrowsError(try AlarmPlan.make(id, now: Self.now))
    let noOffset = try AlarmRequest.from(Self.request { $0["fireAt"] = "2026-10-03T03:00:00" })
    XCTAssertThrowsError(try AlarmPlan.make(noOffset, now: Self.now))
    XCTAssertThrowsError(try AlarmRequest.from(Self.request { $0.removeValue(forKey: "labels") }))
  }
}
