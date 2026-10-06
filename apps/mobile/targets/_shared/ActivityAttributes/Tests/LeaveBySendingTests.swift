#if CP_TARGET_TESTS
import XCTest

@testable import LiveActivityLogicCore

final class LeaveBySendingTests: XCTestCase {
    private let hashes = ["aaaa0001", "bbbb0002", "cccc0003"]
    private let tapped = Date(timeIntervalSince1970: 1_790_000_000)

    func testIAmUpFillsOnlyTheMembersOwnEmptyPip() {
        XCTAssertEqual(
            LeaveBySendingMark.pipToFill(hashes: hashes, ups: [true, false, false], mine: "bbbb0002"), 1)
        XCTAssertNil(
            LeaveBySendingMark.pipToFill(hashes: hashes, ups: [true, true, false], mine: "bbbb0002"))
        XCTAssertNil(
            LeaveBySendingMark.pipToFill(hashes: hashes, ups: [false, false, false], mine: "ffff9999"))
    }

    func testThePipReadsSendingUntilTheServersFrameShowsItUp() {
        let mark = LeaveBySendingMark(uidHash: "bbbb0002", seq: 7, at: tapped)
        // The phone's own fill, and anything older.
        XCTAssertEqual(mark.sendingPip(hashes: hashes, ups: [true, true, false], seq: 7, now: tapped), 1)
        // A newer frame from the server with the pip up: sent.
        XCTAssertNil(mark.sendingPip(hashes: hashes, ups: [true, true, false], seq: 8, now: tapped))
        // A newer frame without it (the command is still queued): still sending.
        XCTAssertEqual(
            mark.sendingPip(
                hashes: hashes, ups: [true, false, false], seq: 8, now: tapped.addingTimeInterval(60)), 1)
    }

    func testAnOldTapTheServerNeverShowedStopsReadingSending() {
        let mark = LeaveBySendingMark(uidHash: "bbbb0002", seq: 7, at: tapped)
        let later = tapped.addingTimeInterval(LeaveBySendingMark.patience + 1)
        XCTAssertNil(mark.sendingPip(hashes: hashes, ups: [true, false, false], seq: 9, now: later))
    }

    func testTheMarkRoundTripsThroughTheAppGroupFile() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("leave-by-sending-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let mark = LeaveBySendingMark(uidHash: "bbbb0002", seq: 7, at: tapped)

        try mark.write(activityId: "A1B2", root: root, now: tapped)

        XCTAssertEqual(LeaveBySendingMark.read(activityId: "A1B2", root: root), mark)
        XCTAssertNil(LeaveBySendingMark.read(activityId: "other", root: root))
        let names = try FileManager.default.contentsOfDirectory(
            atPath: root.appendingPathComponent("state/la").path)
        XCTAssertEqual(names, ["A1B2.json"])
    }
}
#endif
