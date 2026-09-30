import Foundation
import XCTest

@testable import CpCalendarReduction

final class BusyDayReducerTests: XCTestCase {
  private let tokyo = TimeZone(identifier: "Asia/Tokyo")!
  private let berlin = TimeZone(identifier: "Europe/Berlin")!

  private func at(_ iso: String) -> Date {
    ISO8601DateFormatter().date(from: iso)!
  }

  private func block(_ start: String, _ end: String, _ kind: BlockKind = .busy, allDay: Bool = false)
    -> BusyBlock
  {
    BusyBlock(start: at(start), end: at(end), kind: kind, allDay: allDay)
  }

  private func states(_ blocks: [BusyBlock], _ from: String, _ to: String, tz: TimeZone? = nil,
    tentative: Bool = false) -> [String]
  {
    BusyDayReducer.reduce(blocks, from: from, to: to, timeZone: tz ?? tokyo, includeTentative: tentative)
      .map(\.state)
  }

  func testThreeWakingHoursMakeADayBusy() {
    // 09:00–12:00 Tokyo = 00:00–03:00Z.
    XCTAssertEqual(states([block("2027-04-02T00:00:00Z", "2027-04-02T03:00:00Z")], "2027-04-02", "2027-04-02"), ["busy"])
    XCTAssertEqual(states([block("2027-04-02T00:00:00Z", "2027-04-02T02:59:00Z")], "2027-04-02", "2027-04-02"), ["free"])
  }

  func testOnlyWakingHoursCount() {
    // 22:00–08:00 Tokyo overnight never counts.
    XCTAssertEqual(
      states([block("2027-04-02T13:00:00Z", "2027-04-02T23:00:00Z")], "2027-04-02", "2027-04-03"),
      ["free", "free"])
  }

  func testAllDayBusyIsBusy() {
    let allDay = block("2027-04-01T15:00:00Z", "2027-04-02T15:00:00Z", allDay: true)
    XCTAssertEqual(states([allDay], "2027-04-01", "2027-04-03"), ["free", "busy", "free"])
  }

  func testTentativeIsMaybeOnlyWhenSharedAndNeverOutranksBusy() {
    let maybe = block("2027-04-02T00:00:00Z", "2027-04-02T05:00:00Z", .tentative)
    XCTAssertEqual(states([maybe], "2027-04-02", "2027-04-02"), ["free"])
    XCTAssertEqual(states([maybe], "2027-04-02", "2027-04-02", tentative: true), ["maybe"])
    let busy = block("2027-04-02T05:00:00Z", "2027-04-02T09:00:00Z")
    XCTAssertEqual(states([maybe, busy], "2027-04-02", "2027-04-02", tentative: true), ["busy"])
  }

  func testMultiDaySpanMarksEachCoveredDay() {
    // Tokyo Apr 2 10:00 → Apr 4 12:00.
    let trip = block("2027-04-02T01:00:00Z", "2027-04-04T03:00:00Z")
    XCTAssertEqual(states([trip], "2027-04-01", "2027-04-05"), ["free", "busy", "busy", "busy", "free"])
  }

  func testDatesAreTheMembersOwnAcrossDaylightSaving() {
    // Berlin springs forward on 2027-03-28; 08:00–12:00 local that day is 06:00–10:00Z.
    let block = block("2027-03-28T06:00:00Z", "2027-03-28T10:00:00Z")
    XCTAssertEqual(states([block], "2027-03-27", "2027-03-29", tz: berlin), ["free", "busy", "free"])
    XCTAssertEqual(states([], "2027-03-27", "2027-03-29", tz: berlin).count, 3)
  }

  func testOnlyDateAndStateLeave() {
    let out = BusyDayReducer.reduce(
      [block("2027-04-02T00:00:00Z", "2027-04-02T04:00:00Z")], from: "2027-04-02", to: "2027-04-02",
      timeZone: tokyo, includeTentative: true)
    XCTAssertEqual(out, [DayState(date: "2027-04-02", state: "busy")])
    XCTAssertEqual(Set(out[0].dictionary.keys), ["date", "state"])
  }

  func testAnEmptyOrReversedRangeIsNothing() {
    XCTAssertEqual(states([], "2027-04-03", "2027-04-02"), [])
    XCTAssertEqual(states([], "bad", "2027-04-02"), [])
  }
}
