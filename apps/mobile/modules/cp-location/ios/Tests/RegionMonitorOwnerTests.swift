import Foundation
import XCTest

@testable import CpLocationPlanMath

/// A region monitor that counts how often it was created and lets the test push events.
final class FakeBackend: RegionMonitorBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<RegionEvent>.Continuation?
  private var streams = 0
  private(set) var added: [String] = []
  private(set) var removed: [String] = []

  var streamCount: Int { lock.withLock { streams } }

  func add(_ region: PlannedRegion) async { lock.withLock { added.append(region.id) } }
  func remove(_ id: String) async { lock.withLock { removed.append(id) } }

  func events() async -> AsyncStream<RegionEvent> {
    let (stream, continuation) = AsyncStream<RegionEvent>.makeStream()
    lock.withLock {
      streams += 1
      self.continuation = continuation
    }
    return stream
  }

  func emit(_ event: RegionEvent) {
    _ = lock.withLock { continuation }?.yield(event)
  }
}

final class Counter: @unchecked Sendable {
  private let lock = NSLock()
  private var value = 0
  func increment() { lock.withLock { value += 1 } }
  var count: Int { lock.withLock { value } }
}

final class Received: @unchecked Sendable {
  private let lock = NSLock()
  private var events: [String] = []
  func append(_ event: String) { lock.withLock { events.append(event) } }
  var all: [String] { lock.withLock { events } }
}

final class RegionMonitorOwnerTests: XCTestCase {
  private func region(_ id: String) -> PlannedRegion {
    PlannedRegion(id: id, latitude: -8.5, longitude: 115.26, radius: 150)
  }

  private func makeOwner(
    plan: [PlannedRegion] = [], backend: FakeBackend, opens: Counter
  ) -> RegionMonitorOwner {
    RegionMonitorOwner(
      initialPlan: plan, savePlan: { _ in },
      makeBackend: {
        opens.increment()
        try? await Task.sleep(nanoseconds: 20_000_000)
        return backend
      })
  }

  /// Waits (briefly) for the consumer task to deliver pending events.
  private func settle() async {
    for _ in 0..<20 { await Task.yield() }
    try? await Task.sleep(nanoseconds: 20_000_000)
  }

  func testOpensTheMonitorOnceAcrossConcurrentAndRepeatedCalls() async {
    let backend = FakeBackend()
    let opens = Counter()
    let owner = makeOwner(backend: backend, opens: opens)
    async let first: Void = { _ = await owner.open() }()
    async let second: Void = { _ = await owner.open() }()
    _ = await (first, second)
    _ = await owner.open()
    _ = await owner.replace(with: [region("a")])
    await settle()
    XCTAssertEqual(opens.count, 1)
    XCTAssertEqual(backend.streamCount, 1)
  }

  func testANewModuleInstanceTakesOverTheSinkAndTheOldOneHearsNothing() async {
    let backend = FakeBackend()
    let owner = makeOwner(backend: backend, opens: Counter())
    let old = Received()
    let new = Received()
    let oldIdentity = ObjectIdentifier(old)
    let newIdentity = ObjectIdentifier(new)
    await owner.setSink({ old.append($0.id) }, owner: oldIdentity)
    _ = await owner.open()
    backend.emit(RegionEvent(id: "a", entered: true, timestamp: Date()))
    await settle()

    // The JS runtime reloads: the new instance swaps its sink in, then the old one goes away.
    await owner.setSink({ new.append($0.id) }, owner: newIdentity)
    await owner.releaseSink(owner: oldIdentity)
    _ = await owner.open()
    backend.emit(RegionEvent(id: "b", entered: false, timestamp: Date()))
    await settle()

    XCTAssertEqual(old.all, ["a"])
    XCTAssertEqual(new.all, ["b"])
    XCTAssertEqual(backend.streamCount, 1)

    await owner.releaseSink(owner: newIdentity)
    backend.emit(RegionEvent(id: "c", entered: true, timestamp: Date()))
    await settle()
    XCTAssertEqual(new.all, ["b"])
  }

  func testAPlanFromAnEarlierLaunchIsReplacedAndClearedThroughOneMonitor() async {
    let backend = FakeBackend()
    let opens = Counter()
    let owner = makeOwner(plan: [region("a"), region("b")], backend: backend, opens: opens)
    let hasPlan = await owner.hasPlan
    XCTAssertTrue(hasPlan)
    let held = await owner.replace(with: [region("b"), region("c")])
    XCTAssertEqual(held, 2)
    XCTAssertEqual(backend.removed, ["a"])
    XCTAssertEqual(backend.added, ["c"])
    await owner.clear()
    XCTAssertEqual(backend.removed, ["a", "b", "c"])
    let emptied = await owner.hasPlan
    XCTAssertFalse(emptied)
    XCTAssertEqual(opens.count, 1)
  }
}
