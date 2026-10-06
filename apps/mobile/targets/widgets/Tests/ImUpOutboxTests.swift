#if CP_TARGET_TESTS
import XCTest

@testable import PendingActionsCore

/// What the lock-screen "I'M UP" button queues. The app's drain test
/// (apps/mobile/src/data/commands/__tests__/drain-extension-outbox.test.ts) reads the same fixture,
/// so the file this writer produces is the file the drain is proven to accept.
final class ImUpOutboxTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("im-up-outbox-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private var fileUrl: URL { root.appendingPathComponent(PendingActionsOutbox.relativePath) }

    private func json(_ url: URL) throws -> NSDictionary {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? NSDictionary)
    }

    func testWritesTheFixtureTheDrainAccepts() throws {
        let fixtureUrl = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/im-up-pending-actions.json")
        let now = try XCTUnwrap(ISO8601DateFormatter.fractional.date(from: "2026-10-02T05:40:12.250Z"))

        let action = PendingAction.imUp(
            leaveById: "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f",
            opId: "019a9f3c-8a3a-7c21-9d4e-5b6f7a8b9c0d",
            now: now
        )
        try PendingActionsOutbox.append(action, root: root, now: now)

        XCTAssertEqual(try json(fileUrl), try json(fixtureUrl))
    }

    func testKeepsEntriesOtherWritersQueued() throws {
        let alarmSnooze: [String: Any] = [
            "op_id": "019a9f3c-0000-7000-8000-000000000001", "cmd": "snooze_leave_by", "v": 1,
            "via": "app_intent", "scope": "trip_day", "client_ts": "2026-10-02T05:30:00.000Z",
            "payload": ["leave_by_id": "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f", "count": 2],
        ]
        try FileManager.default.createDirectory(
            at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: [
            "schema": 1, "generated_at": "2026-10-02T05:30:00.000Z", "actions": [alarmSnooze],
        ]).write(to: fileUrl)

        try PendingActionsOutbox.append(.imUp(leaveById: "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f"), root: root)

        let actions = try XCTUnwrap(try json(fileUrl)["actions"] as? [NSDictionary])
        XCTAssertEqual(actions.count, 2)
        XCTAssertEqual(actions[0], alarmSnooze as NSDictionary)
        XCTAssertEqual(actions[1]["cmd"] as? String, "set_readiness")
    }

    func testLeavesANewerSchemaUntouched() throws {
        let newer = Data(#"{"schema":2,"generated_at":"2026-10-02T05:30:00.000Z","actions":[]}"#.utf8)
        try FileManager.default.createDirectory(
            at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
        try newer.write(to: fileUrl)

        XCTAssertThrowsError(
            try PendingActionsOutbox.append(.imUp(leaveById: "x"), root: root)
        ) { error in
            XCTAssertEqual(error as? PendingActionsOutboxError, .unsupportedSchema)
        }
        XCTAssertEqual(try Data(contentsOf: fileUrl), newer)
    }

    func testOpIdsAreTimeOrderedUuidV7() throws {
        let now = Date(timeIntervalSince1970: 1_790_000_000.123)
        let opId = PendingAction.uuidV7(now: now)
        XCTAssertNotNil(
            opId.range(
                of: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                options: .regularExpression))
        let millis = UInt64(opId.replacingOccurrences(of: "-", with: "").prefix(12), radix: 16)
        XCTAssertEqual(millis, 1_790_000_000_123)
        XCTAssertNotEqual(opId, PendingAction.uuidV7(now: now))
    }

    func testSnoozeQueuesTheLeaveByWithoutACountOfItsOwn() throws {
        try PendingActionsOutbox.append(
            .snooze(leaveById: "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f"), root: root)

        let actions = try XCTUnwrap(try json(fileUrl)["actions"] as? [NSDictionary])
        XCTAssertEqual(actions.first?["cmd"] as? String, "snooze_leave_by")
        XCTAssertEqual(actions.first?["via"] as? String, "la_intent")
        XCTAssertEqual(actions.first?["scope"] as? String, "readiness")
        XCTAssertEqual(
            actions.first?["payload"] as? NSDictionary,
            ["leave_by_id": "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f"] as NSDictionary)
    }

    func testRefusesWithoutAnAppGroupContainer() {
        XCTAssertThrowsError(try PendingActionsOutbox.append(.imUp(leaveById: "x"), root: nil)) { error in
            XCTAssertEqual(error as? PendingActionsOutboxError, .noAppGroupContainer)
        }
    }
}

extension ISO8601DateFormatter {
    fileprivate static var fractional: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }
}
#endif
