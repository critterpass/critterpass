#if CP_TARGET_TESTS
import XCTest

@testable import PendingActionsCore

/// What the lock-screen buttons of the newer activities queue, on top of a file an older build
/// already wrote. `Fixtures/im-up-pending-actions.json` is that older file: one I'M UP whose
/// payload values are all strings, exactly as TestFlight 16 persisted it. The file after the new
/// buttons were tapped is `Fixtures/lock-screen-pending-actions.json`, which the app's side reads
/// in src/features/trip/live-activities/__tests__/lock-screen-outbox.test.ts: every entry, the
/// older one included, is one the drain accepts and its command's payload schema passes.
final class LockScreenOutboxTests: XCTestCase {
    private var root: URL!

    private static let trip = "7c1e4d2a-9b3f-4a5c-8d6e-1f2a3b4c5d6e"
    private static let meetup = "3a9d8c7b-6e5f-4d3c-9b2a-1f0e9d8c7b6a"
    private static let sos = "2b4d6f80-1a3c-4e5f-8a7b-9c0d1e2f3a4b"
    private static let poll = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b"
    private static let option = "4f3e2d1c-0b9a-4876-9543-210fedcba987"

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("lock-screen-outbox-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private var fileUrl: URL { root.appendingPathComponent(PendingActionsOutbox.relativePath) }

    private func fixture(_ name: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/\(name)")
    }

    private func json(_ url: URL) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? NSDictionary)
    }

    func testAppendsToAFileAnOlderBuildWroteAndKeepsItsEntry() throws {
        try FileManager.default.createDirectory(
            at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: fixture("im-up-pending-actions.json"), to: fileUrl)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let now = try XCTUnwrap(formatter.date(from: "2026-10-03T09:41:05.500Z"))
        let op = { (n: Int) in "019aa4b2-1c3d-7e4f-8a5b-6c7d8e9f0a0\(n)" }

        let actions: [PendingAction] = [
            .runningLate(tripId: Self.trip, meetupId: Self.meetup, opId: op(1), now: now),
            .pingAll(tripId: Self.trip, onMyWay: true, opId: op(2), now: now),
            .pingAll(tripId: Self.trip, onMyWay: false, opId: op(3), now: now),
            .sos(tripId: Self.trip, opId: op(4), now: now),
            .coming(sosId: Self.sos, opId: op(5), now: now),
            .ballot(pollId: Self.poll, optionId: Self.option, via: .laIntent, opId: op(6), now: now),
            .ballot(pollId: Self.poll, optionId: Self.option, via: .widget, opId: op(7), now: now),
        ]
        for action in actions {
            try PendingActionsOutbox.append(action, root: root, now: now)
        }

        let written = try json(fileUrl)
        XCTAssertEqual(written, try json(fixture("lock-screen-pending-actions.json")))
        // The older build's entry is still first and still exactly what it wrote.
        let older = try XCTUnwrap(try json(fixture("im-up-pending-actions.json"))["actions"] as? [NSDictionary])
        let kept = try XCTUnwrap(written["actions"] as? [NSDictionary])
        XCTAssertEqual(kept.first, older.first)
        XCTAssertEqual(kept.count, 8)
    }

    func testMinutesTravelAsANumberAndIdsAsText() throws {
        let entry = PendingAction.runningLate(tripId: Self.trip, meetupId: Self.meetup).entry
        let payload = try XCTUnwrap(entry["payload"] as? [String: Any])
        XCTAssertEqual(payload["minutes"] as? Int, 10)
        XCTAssertEqual(payload["trip_id"] as? String, Self.trip)
        XCTAssertEqual(entry["scope"] as? String, "trip_day")
        XCTAssertEqual(PendingAction.sos(tripId: Self.trip).entry["scope"] as? String, "sos")
    }
}
#endif
