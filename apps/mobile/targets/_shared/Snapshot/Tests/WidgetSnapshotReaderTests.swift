#if CP_TARGET_TESTS
import XCTest

@testable import WidgetSnapshotCore

/// The widgets read the snapshot the app writes. The fixture is the one the app's writer test
/// writes (modules/cp-app-group/src/snapshots/widgets/__tests__), with a field from a newer build.
final class WidgetSnapshotReaderTests: XCTestCase {
    private func fixture() throws -> Data {
        try Data(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().appendingPathComponent("Fixtures/widgets.json"))
    }

    func testReadsTheSnapshotAndIgnoresFieldsItDoesNotKnow() throws {
        let file = try XCTUnwrap(WidgetSnapshotFile.decode(try fixture()))
        XCTAssertEqual(file.snapshot.critterdex.found, 9)
        XCTAssertEqual(file.snapshot.vote?.options.map(\.label), ["Kyoto", "Lisbon"])
        XCTAssertEqual(file.snapshot.trip?.destination, "Bali")
        XCTAssertTrue(file.isLocked("crew"))
        XCTAssertFalse(file.isLocked("countdown"))
        XCTAssertEqual(WidgetDate.parse(file.snapshot.countdown?.targetAt)?.timeIntervalSince1970, 1_791_769_200)
    }

    func testAnUnknownValueInAKnownFieldDoesNotBreakTheRead() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: try fixture()) as? [String: Any])
        json["locked"] = ["crew", "a_widget_from_a_newer_build"]
        let file = try XCTUnwrap(
            WidgetSnapshotFile.decode(try JSONSerialization.data(withJSONObject: json)))
        XCTAssertTrue(file.isLocked("crew"))
    }

    func testRefusesASchemaThisBuildCannotRead() throws {
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: try fixture()) as? [String: Any])
        json["schema"] = 2
        XCTAssertNil(WidgetSnapshotFile.decode(try JSONSerialization.data(withJSONObject: json)))
        XCTAssertNil(WidgetSnapshotFile.decode(Data("not json".utf8)))
    }

    func testSaysWhenTheSnapshotIsOld() throws {
        let file = try XCTUnwrap(WidgetSnapshotFile.decode(try fixture()))
        XCTAssertFalse(file.isStale(at: file.generatedAt.addingTimeInterval(5 * 3600)))
        XCTAssertTrue(file.isStale(at: file.generatedAt.addingTimeInterval(7 * 3600)))
    }
}
#endif
