import XCTest

@testable import CpSpeechCore

final class ChunkQueueTests: XCTestCase {
  func testReleasesChunksInSequenceOrder() {
    var queue = ChunkQueue<String>()
    XCTAssertEqual(queue.push(turn: "a", seq: 1, item: "a1"), [])
    XCTAssertEqual(queue.push(turn: "a", seq: 2, item: "a2"), [])
    XCTAssertEqual(queue.push(turn: "a", seq: 0, item: "a0"), ["a0", "a1", "a2"])
    XCTAssertEqual(queue.push(turn: "a", seq: 3, item: "a3"), ["a3"])
    XCTAssertTrue(queue.isEmpty)
  }

  func testDropsDuplicates() {
    var queue = ChunkQueue<String>()
    XCTAssertEqual(queue.push(turn: "a", seq: 0, item: "a0"), ["a0"])
    XCTAssertEqual(queue.push(turn: "a", seq: 0, item: "again"), [])
    XCTAssertEqual(queue.push(turn: "a", seq: 2, item: "a2"), [])
    XCTAssertEqual(queue.push(turn: "a", seq: 2, item: "again"), [])
    XCTAssertEqual(queue.push(turn: "a", seq: 1, item: "a1"), ["a1", "a2"])
  }

  func testCancelledTurnStaysSilent() {
    var queue = ChunkQueue<String>()
    XCTAssertEqual(queue.push(turn: "a", seq: 0, item: "a0"), ["a0"])
    XCTAssertEqual(queue.push(turn: "a", seq: 2, item: "a2"), [])
    queue.cancel()
    XCTAssertEqual(queue.push(turn: "a", seq: 1, item: "a1"), [])
    XCTAssertEqual(queue.push(turn: "b", seq: 0, item: "b0"), ["b0"])
  }

  func testNewTurnReplacesTheOldOne() {
    var queue = ChunkQueue<String>()
    XCTAssertEqual(queue.push(turn: "a", seq: 0, item: "a0"), ["a0"])
    XCTAssertEqual(queue.push(turn: "b", seq: 0, item: "b0"), ["b0"])
    XCTAssertEqual(queue.push(turn: "a", seq: 1, item: "a1"), [])
    XCTAssertEqual(queue.turn, "b")
  }
}
