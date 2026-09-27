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

final class ClipLinkHandoffTests: XCTestCase {
  private let now = ISO8601DateFormatter().date(from: "2026-09-28T04:00:00Z")!

  private func file(_ json: String) -> Data { Data(json.utf8) }

  func testReturnsAFreshClipLink() {
    let data = file(#"{"schema": 1, "generated_at": "2026-09-28T03:59:00.000Z", "url": "https://critterpass.app/i/BAX6XD"}"#)
    XCTAssertEqual(ClipLinkHandoff.link(in: data, now: now), "https://critterpass.app/i/BAX6XD")
  }

  func testIgnoresStaleUnknownOrInsecureHandoffs() {
    let stale = file(#"{"schema": 1, "generated_at": "2026-09-01T00:00:00Z", "url": "https://critterpass.app/i/BAX6XD"}"#)
    let newer = file(#"{"schema": 2, "generated_at": "2026-09-28T03:59:00Z", "url": "https://critterpass.app/i/BAX6XD"}"#)
    let insecure = file(#"{"schema": 1, "generated_at": "2026-09-28T03:59:00Z", "url": "http://critterpass.app/i/BAX6XD"}"#)
    XCTAssertNil(ClipLinkHandoff.link(in: stale, now: now))
    XCTAssertNil(ClipLinkHandoff.link(in: newer, now: now))
    XCTAssertNil(ClipLinkHandoff.link(in: insecure, now: now))
  }

  func testConsumingRemovesTheHandoff() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let state = root.appendingPathComponent("state")
    try FileManager.default.createDirectory(at: state, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try file(#"{"schema": 1, "generated_at": "2026-09-28T03:59:00Z", "url": "https://critterpass.app/i/BAX6XD"}"#)
      .write(to: state.appendingPathComponent("clip-link.json"))
    XCTAssertEqual(ClipLinkHandoff.consume(containerUrl: root, now: now), "https://critterpass.app/i/BAX6XD")
    XCTAssertNil(ClipLinkHandoff.consume(containerUrl: root, now: now))
  }
}
