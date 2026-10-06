#if CP_TARGET_TESTS
import XCTest

@testable import WidgetSnapshotCore

/// After a widget push the widgets fetch the snapshot themselves; what they keep decides what the
/// home screen shows until the app next runs.
final class WidgetSnapshotRefreshTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("widget-refresh-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func fixture() throws -> Data {
        try Data(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/widgets.json"))
    }

    func testFetchesWithoutASnapshotOrWithAnOldOneButNotAJustWrittenOne() throws {
        let file = try XCTUnwrap(WidgetSnapshotFile.decode(try fixture()))
        XCTAssertTrue(WidgetSnapshotRefresh.needsFetch(current: nil, now: Date()))
        XCTAssertTrue(
            WidgetSnapshotRefresh.needsFetch(current: file, now: file.generatedAt.addingTimeInterval(600)))
        XCTAssertFalse(
            WidgetSnapshotRefresh.needsFetch(current: file, now: file.generatedAt.addingTimeInterval(30)))
    }

    func testKeepsAReadableSnapshotAndNothingElse() throws {
        let path = root.appendingPathComponent(WidgetSnapshotFile.relativePath)

        XCTAssertFalse(WidgetSnapshotRefresh.store(statusCode: 304, body: Data(), root: root))
        XCTAssertFalse(
            WidgetSnapshotRefresh.store(statusCode: 200, body: Data(#"{"error":{}}"#.utf8), root: root))
        XCTAssertFalse(FileManager.default.fileExists(atPath: path.path))

        XCTAssertTrue(WidgetSnapshotRefresh.store(statusCode: 200, body: try fixture(), root: root))
        XCTAssertEqual(WidgetSnapshotFile.read(root: root)?.snapshot.critterdex.found, 9)
        let leftovers = try FileManager.default.contentsOfDirectory(
            atPath: path.deletingLastPathComponent().path)
        XCTAssertEqual(leftovers, ["widgets.json"])
    }

    func testThePushTokenIsLeftForTheAppAsHex() throws {
        let token = WidgetPushTokenFile(token: Data([0x0A, 0xFF, 0x00, 0x7B]), now: Date())
        try token.write(root: root)
        XCTAssertEqual(WidgetPushTokenFile.read(root: root)?.token, "0aff007b")
    }
}
#endif
