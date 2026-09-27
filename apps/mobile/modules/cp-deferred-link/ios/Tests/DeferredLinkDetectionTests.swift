import UIKit
import XCTest

@testable import CpDeferredLink

final class DeferredLinkDetectionTests: XCTestCase {
  func testLikelyLinkWhenAProbableWebURLIsDetected() {
    XCTAssertTrue(DeferredLinkDetection.likelyLink(in: [.probableWebURL]))
  }

  func testNoLinkForOtherPatternsOrNone() {
    XCTAssertFalse(DeferredLinkDetection.likelyLink(in: [.probableWebSearch]))
    XCTAssertFalse(DeferredLinkDetection.likelyLink(in: []))
  }
}
