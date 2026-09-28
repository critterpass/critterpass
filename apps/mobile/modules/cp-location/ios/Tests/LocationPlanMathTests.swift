import XCTest

@testable import CpLocationPlanMath

final class LocationPlanMathTests: XCTestCase {
  private func region(_ id: String, _ radius: Double = 150) -> PlannedRegion {
    PlannedRegion(id: id, latitude: -8.5, longitude: 115.26, radius: radius)
  }

  func testDiffKeepsUnchangedRegionsAndReplacesMovedOnes() {
    let current = [region("a"), region("b"), region("c")]
    let next = [region("a"), region("b", 300), region("d")]
    let diff = LocationPlanMath.diff(current: current, next: next)
    XCTAssertEqual(diff.remove, ["b", "c"])
    XCTAssertEqual(diff.add.map(\.id), ["b", "d"])
  }

  func testDiffCapsAtTheMonitorLimitAndDropsDuplicates() {
    let next = (0..<30).map { region("r\($0)") } + [region("r0")]
    let diff = LocationPlanMath.diff(current: [], next: next)
    XCTAssertEqual(diff.add.count, LocationPlanMath.monitorLimit)
    XCTAssertEqual(LocationPlanMath.diff(current: [region("x")], next: next, limit: 0).remove, ["x"])
  }

  func testMockFlags() {
    XCTAssertEqual(LocationPlanMath.mockFlags(simulatedBySoftware: false, producedByAccessory: false), 0)
    XCTAssertEqual(LocationPlanMath.mockFlags(simulatedBySoftware: true, producedByAccessory: false), 1)
    XCTAssertEqual(LocationPlanMath.mockFlags(simulatedBySoftware: true, producedByAccessory: true), 3)
  }

  func testCoarseTierThrottlesAndPausedEmitsNothing() {
    let now = Date(timeIntervalSince1970: 1000)
    XCTAssertTrue(LocationPlanMath.shouldEmit(tier: "high", lastEmitted: now, now: now))
    XCTAssertFalse(LocationPlanMath.shouldEmit(tier: "paused", lastEmitted: nil, now: now))
    XCTAssertTrue(LocationPlanMath.shouldEmit(tier: "coarse", lastEmitted: nil, now: now))
    XCTAssertFalse(LocationPlanMath.shouldEmit(tier: "coarse", lastEmitted: now, now: now.addingTimeInterval(30)))
    XCTAssertTrue(LocationPlanMath.shouldEmit(tier: "coarse", lastEmitted: now, now: now.addingTimeInterval(60)))
  }

  func testFixBody() {
    let body = LocationPlanMath.fixBody(
      latitude: 1, longitude: 2, horizontalAccuracy: -1, timestamp: Date(timeIntervalSince1970: 2),
      speed: -1, stationary: true, mockFlags: 2)
    XCTAssertEqual(body["acc"] as? Double, 0)
    XCTAssertEqual(body["at"] as? Double, 2000)
    XCTAssertNil(body["speed"])
    XCTAssertEqual(body["mock"] as? Int, 2)
  }
}
