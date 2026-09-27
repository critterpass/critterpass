import CoreHaptics
import XCTest

@testable import CpHaptics

final class HapticPatternsTests: XCTestCase {
  func testSosEventsHaveNineDotDashDotPulses() {
    let events = HapticPatterns.sosEvents()
    XCTAssertEqual(events.count, 9, "three short, three long, three short")
  }

  func testSosPulseDurationsMatchShortLongShortGroups() {
    let events = HapticPatterns.sosEvents()
    let durations = events.map(\.duration)

    let shortGroup = Array(durations[0..<3])
    let longGroup = Array(durations[3..<6])
    let finalShortGroup = Array(durations[6..<9])

    XCTAssertTrue(shortGroup.allSatisfy { $0 == HapticPatterns.shortPulseSeconds })
    XCTAssertTrue(longGroup.allSatisfy { $0 == HapticPatterns.longPulseSeconds })
    XCTAssertTrue(finalShortGroup.allSatisfy { $0 == HapticPatterns.shortPulseSeconds })
  }

  func testSosEventsAreStrictlyOrderedInTime() {
    let events = HapticPatterns.sosEvents()
    let times = events.map(\.relativeTime)
    XCTAssertEqual(times, times.sorted(), "each pulse must start after the previous one ends")
  }

  func testSosPatternBuildsWithoutThrowing() {
    XCTAssertNoThrow(try HapticPatterns.sos())
  }

  func testContinuousRampPatternBuildsWithoutThrowing() {
    XCTAssertNoThrow(try HapticPatterns.continuousRamp(maxDuration: 60))
  }
}
