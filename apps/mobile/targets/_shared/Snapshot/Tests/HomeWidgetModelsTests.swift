#if CP_TARGET_TESTS
import XCTest

@testable import WidgetSnapshotCore

final class HomeWidgetModelsTests: XCTestCase {
    private func snapshot(_ edit: (inout [String: Any]) -> Void = { _ in }) throws -> WidgetSnapshot {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("Fixtures/widgets.json")
        var json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        edit(&json)
        return try JSONDecoder().decode(
            WidgetSnapshot.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func at(_ text: String) throws -> Date { try XCTUnwrap(WidgetDate.parse(text)) }

    func testCountsCalendarDaysInTheTripsZone() throws {
        let snap = try snapshot()
        // 25 Sep, 10:41 in Bali; the flight leaves 12 Oct 09:40 Bali time: 17 days.
        XCTAssertEqual(
            CountdownModel.face(snapshot: snap, now: try at("2026-09-25T02:41:00Z")),
            .daysTo(place: "Bali", days: 17))
        // Just before midnight in Bali it is still 17; just after, 16.
        XCTAssertEqual(
            CountdownModel.face(snapshot: snap, now: try at("2026-09-25T15:59:00Z")),
            .daysTo(place: "Bali", days: 17))
        XCTAssertEqual(
            CountdownModel.face(snapshot: snap, now: try at("2026-09-25T16:01:00Z")),
            .daysTo(place: "Bali", days: 16))
    }

    func testOnTheTripItCountsTheDayAndAfterwardsNothing() throws {
        let snap = try snapshot()
        XCTAssertEqual(
            CountdownModel.face(snapshot: snap, now: try at("2026-10-15T03:00:00Z")),
            .onTrip(place: "Bali", day: 4))
        XCTAssertEqual(
            CountdownModel.face(snapshot: snap, now: try at("2026-10-20T03:00:00Z")), .noTrip)
        XCTAssertEqual(
            CountdownModel.face(snapshot: try snapshot { $0["trip"] = NSNull() }, now: Date()),
            .noTrip)
    }

    func testTheTimelineTurnsAtEachLocalMidnight() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Makassar"))
        let nights = CountdownModel.midnights(after: try at("2026-09-25T02:41:00Z"), count: 2, zone: zone)
        XCTAssertEqual(nights, [try at("2026-09-25T16:00:00Z"), try at("2026-09-26T16:00:00Z")])
    }

    func testTheShowdownShowsTheTwoLeadersAndMyVote() throws {
        let face = try XCTUnwrap(VoteFace.make(vote: try snapshot().vote))
        XCTAssertEqual([face.left.label, face.right.label], ["Kyoto", "Lisbon"])
        XCTAssertEqual([face.left.votes, face.right.votes], [4, 2])
        XCTAssertTrue(face.left.mine)
        XCTAssertFalse(face.closed)
    }

    func testATapCountsAtOnceButNeverTwice() throws {
        let unvoted = try snapshot {
            var vote = $0["vote"] as! [String: Any]
            vote["my_option_id"] = NSNull()
            $0["vote"] = vote
        }
        let lisbon = "0199a3c0-0000-7000-8000-00000000c102"
        let face = try XCTUnwrap(VoteFace.make(vote: unvoted.vote, pending: lisbon))
        XCTAssertEqual([face.left.votes, face.right.votes], [4, 3])
        XCTAssertTrue(face.right.mine)
        // Once the snapshot has the vote, the pending tap adds nothing.
        let counted = try XCTUnwrap(VoteFace.make(vote: try snapshot().vote, pending: lisbon))
        XCTAssertEqual([counted.left.votes, counted.right.votes], [4, 2])
    }

    func testAClosedVoteShowsItsWinner() throws {
        let closed = try snapshot {
            var vote = $0["vote"] as! [String: Any]
            vote["status"] = "closed"
            vote["winner_option_id"] = "0199a3c0-0000-7000-8000-00000000c101"
            $0["vote"] = vote
        }
        let face = try XCTUnwrap(VoteFace.make(vote: closed.vote))
        XCTAssertTrue(face.closed)
        XCTAssertTrue(face.left.winner)
        XCTAssertFalse(face.right.winner)
    }

    func testCritterdexFraction() {
        XCTAssertEqual(CritterdexModel.fraction(found: 9, total: 150), 0.06, accuracy: 0.0001)
        XCTAssertEqual(CritterdexModel.fraction(found: 3, total: 0), 0)
        XCTAssertEqual(CritterdexModel.fraction(found: 200, total: 150), 1)
    }
}
#endif
