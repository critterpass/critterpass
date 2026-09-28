import XCTest

@testable import CpPermissionsMapping

final class StatusMappingTests: XCTestCase {
  func testNotificationsKeepProvisionalUpgradeable() {
    XCTAssertEqual(StatusMapping.notifications(0), KindState(.notDetermined, canAskAgain: true))
    XCTAssertEqual(StatusMapping.notifications(1), KindState(.denied, canAskAgain: false))
    XCTAssertEqual(StatusMapping.notifications(2), KindState(.granted, canAskAgain: false))
    XCTAssertEqual(StatusMapping.notifications(3), KindState(.provisional, canAskAgain: true))
    XCTAssertEqual(StatusMapping.notifications(4), KindState(.granted, canAskAgain: false))
  }

  func testLocationLevelsPrecisionAndTheOneAlwaysPrompt() {
    XCTAssertEqual(StatusMapping.location(0, fullAccuracy: false, alwaysAsked: false).level, "none")
    XCTAssertEqual(StatusMapping.location(1, fullAccuracy: true, alwaysAsked: false).state.status, .restricted)
    XCTAssertEqual(StatusMapping.location(2, fullAccuracy: true, alwaysAsked: false).state, KindState(.denied, canAskAgain: false))
    let wiu = StatusMapping.location(4, fullAccuracy: false, alwaysAsked: false)
    XCTAssertEqual(wiu, LocationState(state: KindState(.granted, canAskAgain: true), level: "wiu", precise: false))
    XCTAssertFalse(StatusMapping.location(4, fullAccuracy: true, alwaysAsked: true).state.canAskAgain)
    let always = StatusMapping.location(3, fullAccuracy: true, alwaysAsked: true)
    XCTAssertEqual(always.level, "always")
    XCTAssertTrue(always.precise)
  }

  func testCalendarWriteOnlyIsLimited() {
    XCTAssertEqual(StatusMapping.calendar(4), KindState(.limited, canAskAgain: true))
    XCTAssertEqual(StatusMapping.calendar(3).status, .granted)
    XCTAssertEqual(StatusMapping.calendar(1).status, .restricted)
    XCTAssertEqual(StatusMapping.calendar(2).status, .denied)
    XCTAssertEqual(StatusMapping.calendar(0).status, .notDetermined)
  }

  func testCaptureSpeechPhotosAndAlarms() {
    XCTAssertEqual(StatusMapping.capture(3).status, .granted)
    XCTAssertEqual(StatusMapping.capture(1).status, .restricted)
    XCTAssertEqual(StatusMapping.capture(2).status, .denied)
    XCTAssertEqual(StatusMapping.capture(0).status, .notDetermined)
    XCTAssertEqual(StatusMapping.speech(2).status, .restricted)
    XCTAssertEqual(StatusMapping.speech(1).status, .denied)
    XCTAssertEqual(StatusMapping.speech(3).status, .granted)
    XCTAssertEqual(StatusMapping.speech(0).status, .notDetermined)
    XCTAssertEqual(StatusMapping.photos(4), KindState(.limited, canAskAgain: false))
    XCTAssertEqual(StatusMapping.photos(3).status, .granted)
    XCTAssertEqual(StatusMapping.photos(2).status, .denied)
    XCTAssertEqual(StatusMapping.photos(1).status, .restricted)
    XCTAssertEqual(StatusMapping.photos(0).status, .notDetermined)
    XCTAssertEqual(StatusMapping.alarms(0).status, .notDetermined)
    XCTAssertEqual(StatusMapping.alarms(1).status, .denied)
    XCTAssertEqual(StatusMapping.alarms(2).status, .granted)
    XCTAssertEqual(StatusMapping.liveActivities(enabled: false), KindState(.denied, canAskAgain: false))
  }

  func testDictionariesCarryWireNames() {
    let dict = StatusMapping.location(4, fullAccuracy: true, alwaysAsked: false).dictionary
    XCTAssertEqual(dict["status"] as? String, "granted")
    XCTAssertEqual(dict["level"] as? String, "wiu")
    XCTAssertEqual(dict["precise"] as? Bool, true)
  }
}
