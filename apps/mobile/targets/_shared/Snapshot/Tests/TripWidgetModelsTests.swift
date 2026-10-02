#if CP_TARGET_TESTS
import XCTest

@testable import WidgetSnapshotCore

final class TripWidgetModelsTests: XCTestCase {
    private func at(_ text: String) throws -> Date { try XCTUnwrap(WidgetDate.parse(text)) }

    private func item(_ id: String, status: String = "open", action: String = "done") -> WSItem {
        WSItem(id: id, icon: "sun", text: "Item \(id)", action: action, status: status, deepLink: nil)
    }

    func testTodayStrikesFinishedItemsAndOffersOnlyOpenActions() throws {
        let today = WSToday(localDate: "2026-10-15", items: [
            item("a", status: "done"), item("b"), item("c", action: "open"), item("d", action: "nudge"),
            item("e", status: "nudged", action: "nudge"), item("f"), item("g"),
        ])
        let face = try XCTUnwrap(TodayFace.make(today: today, now: Date(), limit: 5))
        XCTAssertEqual(face.rows.map(\.finished), [true, false, false, false, true])
        XCTAssertEqual(face.rows.map(\.action), [nil, "done", nil, "nudge", nil])
        XCTAssertEqual(face.more, 2)
    }

    func testATapOnTodayCountsAtOnce() throws {
        let today = WSToday(localDate: "2026-10-15", items: [item("a"), item("b")])
        let face = try XCTUnwrap(TodayFace.make(today: today, now: Date(), acted: ["b"]))
        XCTAssertEqual(face.rows.map(\.finished), [false, true])
        XCTAssertNil(TodayFace.make(today: WSToday(localDate: "2026-10-15", items: []), now: Date()))
        XCTAssertNil(TodayFace.make(today: nil, now: Date()))
    }

    private func plan(_ id: String, _ at: String) -> WSPlan {
        WSPlan(id: id, startsAt: at, title: "Stop \(id)")
    }

    func testThePlanStrikesAStopOnceTheNextHasBegun() throws {
        var today = WSToday(localDate: "2026-10-15", items: [item("brief")])
        today.plan = [
            plan("summit", "2026-10-14T22:02:00Z"), plan("breakfast", "2026-10-15T01:30:00Z"),
            plan("springs", "2026-10-15T05:00:00Z"),
        ]
        let face = try XCTUnwrap(TodayFace.make(today: today, now: try at("2026-10-15T02:00:00Z")))
        XCTAssertEqual(face.rows.map(\.text), ["Stop summit", "Stop breakfast", "Stop springs"])
        XCTAssertEqual(face.rows.map(\.finished), [true, false, false])
        XCTAssertEqual(face.rows.first?.at, try at("2026-10-14T22:02:00Z"))
        // The last stop is behind two hours after it began.
        let late = try XCTUnwrap(TodayFace.make(today: today, now: try at("2026-10-15T07:01:00Z")))
        XCTAssertEqual(late.rows.map(\.finished), [true, true, true])
        XCTAssertEqual(
            TodayFace.changes(today: today, after: try at("2026-10-15T02:00:00Z")),
            [try at("2026-10-15T05:00:00Z"), try at("2026-10-15T07:00:00Z")])
    }

    func testPackingTicksAtOnceAndTheForecastReadsAhead() throws {
        var today = WSToday(localDate: "2026-10-15", items: [])
        today.packing = [
            WSPacking(id: "hat", label: "Hat", checked: false),
            WSPacking(id: "fins", label: "Fins", checked: true),
        ]
        today.forecast = WSForecast(tempMaxC: 31, condition: "rain", rainFrom: "2026-10-15T06:00:00Z")
        let now = try at("2026-10-15T02:00:00Z")
        let face = try XCTUnwrap(TodayFace.make(today: today, now: now, acted: [WidgetTaps.packing("hat")]))
        XCTAssertEqual(face.packing.map(\.checked), [true, true])
        XCTAssertEqual(face.forecast, Forecast(snapshot: today.forecast!, now: now))
        XCTAssertEqual(face.forecast?.highC, 31)
        XCTAssertEqual(face.forecast?.line, .rainFrom(try at("2026-10-15T06:00:00Z")))
        XCTAssertEqual(Forecast(snapshot: today.forecast!, now: try at("2026-10-15T07:00:00Z"))?.line, .rainNow)
        let dry = WSForecast(tempMaxC: 29, condition: "clear", rainFrom: nil)
        XCTAssertEqual(Forecast(snapshot: dry, now: now)?.line, .dry)
        XCTAssertEqual(Forecast(snapshot: WSForecast(tempMaxC: 25, condition: "storm", rainFrom: nil), now: now)?.line, .storm)
    }

    func testANudgeGoesToTheOneWhoOwesUntilItHasGone() throws {
        let now = try at("2026-10-15T02:00:00Z")
        var owed = WSBalances(currency: "USD", netMinor: 18600)
        owed.nudge = WSNudge(userId: "dev", firstName: "Dev", availableAt: nil)
        XCTAssertEqual(NudgeFace.make(owed, now: now), NudgeFace(userId: "dev", firstName: "Dev", sentEarlier: false))
        XCTAssertEqual(NudgeFace.make(owed, now: now, acted: [WidgetTaps.nudge("dev")])?.sentEarlier, true)
        owed.nudge?.availableAt = "2026-10-15T20:00:00Z"
        XCTAssertEqual(NudgeFace.make(owed, now: now)?.sentEarlier, true)
        XCTAssertEqual(NudgeFace.make(owed, now: try at("2026-10-15T21:00:00Z"))?.sentEarlier, false)
        var owing = owed
        owing.netMinor = -500
        XCTAssertNil(NudgeFace.make(owing, now: now))
        XCTAssertNil(NudgeFace.make(WSBalances(currency: "USD", netMinor: 900), now: now))
    }

    func testBalancesReadTheirSideAndCurrency() {
        let us = Locale(identifier: "en_US")
        XCTAssertEqual(BalanceFace.make(WSBalances(currency: "USD", netMinor: 18600), locale: us), .owed("$186"))
        XCTAssertEqual(BalanceFace.make(WSBalances(currency: "USD", netMinor: -1250), locale: us), .owes("$12.50"))
        XCTAssertEqual(BalanceFace.make(WSBalances(currency: "JPY", netMinor: 4200), locale: us), .owed("¥4,200"))
        XCTAssertEqual(BalanceFace.make(WSBalances(currency: "USD", netMinor: 0), locale: us), .settled)
        XCTAssertNil(BalanceFace.make(nil))
    }

    func testCrewDotsSitByHowFarOutTheyAre() throws {
        let crew = WSCrew(
            meetup: WSMeetup(placeName: "Campuhan Ridge", meetAt: "2026-10-17T09:00:00.000Z"),
            members: [
                WSMember(userId: "m", bucket: "here", initial: "M"), WSMember(userId: "r", bucket: "here"),
                WSMember(userId: "a", bucket: "close"), WSMember(userId: "j", bucket: "on_way"),
                WSMember(userId: "d", bucket: "unknown"),
            ])
        let face = try XCTUnwrap(CrewFace.make(crew: crew))
        XCTAssertEqual(face.here, 2)
        XCTAssertEqual(face.total, 5)
        XCTAssertEqual(face.dots.map(\.row), [0, -1, 0, 0, 0])
        let xs = face.dots.map(\.x)
        XCTAssertTrue(xs[0] > xs[2] && xs[2] > xs[3] && xs[3] > xs[4])
        XCTAssertFalse(face.dots[4].known)
        // An older snapshot has no initials: the dot shows a question mark.
        XCTAssertEqual(face.dots.map(\.initial).prefix(2), ["M", "?"])
        XCTAssertEqual(face.meetAt, try at("2026-10-17T09:00:00Z"))
    }

    func testFlightShowsTheNextTimeThatMatters() throws {
        let flight = WSNextFlight(
            id: "f", carrier: "SQ", flightNo: "938", depAirport: "SIN", arrAirport: "DPS",
            departsAt: "2026-10-12T13:40:00Z", boardingAt: "2026-10-12T13:02:00Z", gate: "B7",
            terminal: "3", status: "scheduled", delayMin: 0)
        XCTAssertEqual(
            FlightFace.make(flight, now: try at("2026-10-12T10:00:00Z"))?.next,
            .boarding(try at("2026-10-12T13:02:00Z")))
        XCTAssertEqual(
            FlightFace.make(flight, now: try at("2026-10-12T13:10:00Z"))?.next,
            .departs(try at("2026-10-12T13:40:00Z")))
        XCTAssertEqual(FlightFace.make(flight, now: try at("2026-10-12T14:00:00Z"))?.next, .departed)
        let face = try XCTUnwrap(FlightFace.make(flight, now: try at("2026-10-12T10:00:00Z")))
        XCTAssertEqual(face.route, "SIN → DPS")
        XCTAssertEqual(face.flight, "SQ 938")
        XCTAssertNil(face.delayMin)
    }

    func testCountdownRingFillsOverTheLastSixtyDays() {
        XCTAssertEqual(AccessoryModel.countdownRing(days: 60), 0)
        XCTAssertEqual(AccessoryModel.countdownRing(days: 90), 0)
        XCTAssertEqual(AccessoryModel.countdownRing(days: 15), 0.75)
        XCTAssertEqual(AccessoryModel.countdownRing(days: 0), 1)
    }

    func testVoteScoreLeadsWithTheLeaderOrTheWinner() {
        func side(_ id: String, _ votes: Int, winner: Bool = false) -> VoteFace.Side {
            VoteFace.Side(optionId: id, label: id, votes: votes, mine: false, winner: winner)
        }
        let open = VoteFace(pollId: "p", left: side("Kyoto", 4), right: side("Lisbon", 2), more: 0, closed: false, closesAt: nil)
        XCTAssertEqual(AccessoryModel.voteScore(open)?.score, "4–2")
        XCTAssertEqual(AccessoryModel.voteScore(open)?.leader, "Kyoto")
        let trailingLeft = VoteFace(pollId: "p", left: side("Kyoto", 1), right: side("Lisbon", 3), more: 0, closed: false, closesAt: nil)
        XCTAssertEqual(AccessoryModel.voteScore(trailingLeft)?.leader, "Lisbon")
        // A tie closed by the tie rule: the winner leads.
        let closed = VoteFace(pollId: "p", left: side("Kyoto", 3), right: side("Lisbon", 3, winner: true), more: 0, closed: true, closesAt: nil)
        XCTAssertEqual(AccessoryModel.voteScore(closed)?.leader, "Lisbon")
        XCTAssertNil(AccessoryModel.voteScore(nil))
    }

    func testStandByCountsMinutesThenBecomesTheAlarm() throws {
        let leave = try at("2026-10-15T19:10:00Z")
        XCTAssertEqual(LeaveByClockFace.make(leaveAt: leave, now: try at("2026-10-15T18:48:00Z")), .minutes(22))
        XCTAssertEqual(LeaveByClockFace.make(leaveAt: leave, now: try at("2026-10-15T18:48:30Z")), .minutes(22))
        XCTAssertEqual(LeaveByClockFace.make(leaveAt: leave, now: try at("2026-10-15T15:00:00Z")), .at(leave))
        XCTAssertEqual(LeaveByClockFace.make(leaveAt: leave, now: leave), .alarm)
    }

    func testStandByTimelineFlipsEachMinuteAndEndsAtLeaveTime() throws {
        let leave = try at("2026-10-15T19:10:00Z")
        let now = try at("2026-10-15T18:48:30Z")
        let dates = LeaveByClockFace.entryDates(leaveAt: leave, now: now)
        XCTAssertEqual(dates.first, now)
        XCTAssertEqual(dates.last, leave)
        XCTAssertEqual(dates.count, 23)
        XCTAssertEqual(dates[1], try at("2026-10-15T18:49:00Z"))
        XCTAssertEqual(LeaveByClockFace.entryDates(leaveAt: leave, now: leave), [leave])
        // Hours out, the minute entries start 100 minutes before leave time.
        let early = LeaveByClockFace.entryDates(leaveAt: leave, now: try at("2026-10-15T12:00:00Z"))
        XCTAssertEqual(early[1], try at("2026-10-15T17:30:00Z"))
    }

    func testTodayTapsAreKeptForSixHoursAndThenForgotten() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("today-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let morning = try at("2026-10-15T00:00:00Z")
        try WidgetTaps.record(key: "a", at: morning, root: root)
        try WidgetTaps.record(key: "b", at: morning.addingTimeInterval(5 * 3600), root: root)
        let file = WidgetTaps.read(root: root)
        XCTAssertEqual(file.ids(at: morning.addingTimeInterval(5.5 * 3600)), ["a", "b"])
        XCTAssertEqual(file.ids(at: morning.addingTimeInterval(7 * 3600)), ["b"])
        // A later tap drops what has expired from the file.
        try WidgetTaps.record(key: "c", at: morning.addingTimeInterval(7 * 3600), root: root)
        XCTAssertEqual(Set(WidgetTaps.read(root: root).acted.keys), ["b", "c"])
        XCTAssertTrue(WidgetTaps.read(root: nil).acted.isEmpty)
    }
}
#endif
