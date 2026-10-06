#if CP_TARGET_TESTS
import XCTest

@testable import PendingActionsCore

/// A surface's command goes to the server when it can and otherwise waits in the outbox under the
/// same op_id, so the app's later send is a duplicate rather than a second command.
final class SignedActionSenderTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("signed-action-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    func testWithoutAnEndpointTheActionWaitsInTheOutboxUnderItsOpId() async throws {
        let action = PendingAction.imUp(leaveById: "5f0c8e2a-3b1d-4c6e-9a7f-2d4b6c8e0a1f")

        let result = await SignedActionSender.send(action, surface: .liveActivityIntent, root: root)

        XCTAssertEqual(result, .queued)
        let file = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: root.appendingPathComponent(PendingActionsOutbox.relativePath)))
                as? [String: Any])
        let queued = try XCTUnwrap((file["actions"] as? [[String: Any]])?.first)
        XCTAssertEqual(queued["op_id"] as? String, action.opId)
    }

    func testWithoutAnAppGroupNothingIsLostSilently() async {
        let result = await SignedActionSender.send(
            .imUp(leaveById: "x"), surface: .liveActivityIntent, root: nil)
        XCTAssertEqual(result, .failed)
    }

    func testOnlyAnswersAboutTheCommandItselfAreFinal() {
        XCTAssertTrue(SignedActionSender.isFinal(200))
        XCTAssertTrue(SignedActionSender.isFinal(409))
        XCTAssertTrue(SignedActionSender.isFinal(422))
        XCTAssertFalse(SignedActionSender.isFinal(401))
        XCTAssertFalse(SignedActionSender.isFinal(403))
        XCTAssertFalse(SignedActionSender.isFinal(503))
    }

    func testOnlyTextPayloadsAreSignedDirectly() {
        XCTAssertEqual(
            SignedActionSender.textPayload(.imUp(leaveById: "lb")),
            ["leave_by_id": "lb", "state": "up", "source": "la"])
        XCTAssertNil(SignedActionSender.textPayload(.runningLate(tripId: "t", meetupId: "m")))
    }
}
#endif
