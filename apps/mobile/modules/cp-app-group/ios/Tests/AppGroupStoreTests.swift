import Foundation
import XCTest

@testable import CpAppGroupStore

final class AppGroupStoreTests: XCTestCase {
  private var root: URL!

  override func setUpWithError() throws {
    root = FileManager.default.temporaryDirectory
      .appendingPathComponent("cp-app-group-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: root)
  }

  private func fixedClockStore() -> AppGroupStore {
    let fixed = ISO8601DateFormatter().date(from: "2026-09-27T09:30:00Z")!
    return AppGroupStore(root: root, now: { fixed })
  }

  private func action(_ opId: String = UUID().uuidString.lowercased()) -> PendingAction {
    PendingAction(
      opId: opId, cmd: "cast_ballot", v: PendingAction.vValue, via: .laIntent, scope: .ballot,
      clientTs: "2026-09-27T09:29:58.512Z", baseVersion: nil,
      payload: ["poll_id": .string("p1"), "rank": .number(2), "final": .bool(true)])
  }

  private func fileObject(_ store: AppGroupStore) throws -> [String: Any] {
    let text = try store.pendingActionsText()
    return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
  }

  private func opIds(_ store: AppGroupStore) throws -> [String] {
    let data = Data(try store.pendingActionsText().utf8)
    return try JSONDecoder().decode(PendingActionsFile.self, from: data).actions.map(\.opId)
  }

  func testAnEmptyContainerReadsAsAnEmptyVersionedFile() throws {
    let file = try fileObject(AppGroupStore(root: root))
    XCTAssertEqual(file["schema"] as? Int, 1)
    XCTAssertNotNil(file["generated_at"] as? String)
    XCTAssertEqual((file["actions"] as? [Any])?.count, 0)
  }

  /// The app's drain (apps/mobile/src/data/commands) is tested against the same fixture, so what
  /// this store writes is exactly what the app reads.
  func testWritesTheFileTheAppDrains() throws {
    let fixtureUrl = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().appendingPathComponent("Fixtures/pending-actions.json")
    let fixture = try JSONDecoder().decode(
      PendingActionsFile.self, from: Data(contentsOf: fixtureUrl))
    let store = fixedClockStore()
    for action in fixture.actions { try store.appendPendingAction(action) }

    let written = try JSONSerialization.jsonObject(with: Data(store.pendingActionsText().utf8))
    let expected = try JSONSerialization.jsonObject(with: Data(contentsOf: fixtureUrl))
    XCTAssertEqual(written as? NSDictionary, expected as? NSDictionary)
  }

  func testAppendKeepsEarlierEntriesAndRoundTripsPayloads() throws {
    let store = AppGroupStore(root: root)
    let first = action()
    let second = action()
    try store.appendPendingAction(first)
    try store.appendPendingAction(second)

    let data = Data(try store.pendingActionsText().utf8)
    let file = try JSONDecoder().decode(PendingActionsFile.self, from: data)
    XCTAssertEqual(file.actions, [first, second])
  }

  func testWritesLeaveNoTemporaryFilesBehind() throws {
    let store = AppGroupStore(root: root)
    for _ in 0..<5 { try store.appendPendingAction(action()) }
    try store.write(Data("{}".utf8), to: AppGroupStore.endpointsPath)

    let state = try FileManager.default.contentsOfDirectory(
      atPath: root.appendingPathComponent("state").path)
    XCTAssertEqual(state, ["pending-actions.json"])
    XCTAssertEqual(try store.read(AppGroupStore.endpointsPath), Data("{}".utf8))
  }

  func testRemovesOnlyTheDrainedEntries() throws {
    let store = AppGroupStore(root: root)
    let drained = action()
    let later = action()
    try store.appendPendingAction(drained)
    try store.appendPendingAction(later)

    XCTAssertEqual(try store.removePendingActions(opIds: [drained.opId]), 1)
    XCTAssertEqual(try opIds(store), [later.opId])
    XCTAssertEqual(try store.removePendingActions(opIds: [later.opId]), 0)
    XCTAssertEqual(try opIds(store), [])
  }

  func testRemoveDropsEntriesThatHaveNoOpId() throws {
    let url = root.appendingPathComponent(AppGroupStore.pendingActionsPath)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data(#"{"schema":1,"generated_at":"x","actions":[{"cmd":"cast_ballot"}]}"#.utf8)
      .write(to: url)

    XCTAssertEqual(try AppGroupStore(root: root).removePendingActions(opIds: []), 0)
  }

  func testLeavesAFileFromANewerSchemaUntouched() throws {
    let url = root.appendingPathComponent(AppGroupStore.pendingActionsPath)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let newer = Data(#"{"schema":2,"generated_at":"x","actions":[{"op_id":"a"}]}"#.utf8)
    try newer.write(to: url)

    let store = AppGroupStore(root: root)
    XCTAssertThrowsError(try store.removePendingActions(opIds: ["a"])) { error in
      XCTAssertEqual(error as? AppGroupStoreError, .unsupportedSchema(AppGroupStore.pendingActionsPath))
    }
    XCTAssertEqual(try Data(contentsOf: url), newer)
  }

  func testClearEmptiesTheOutbox() throws {
    let store = AppGroupStore(root: root)
    try store.appendPendingAction(action())
    try store.clearPendingActions()
    XCTAssertEqual(try opIds(store), [])
  }

  /// Extensions keep appending while the app drains (read, hand over, remove what it read): every
  /// entry ends up either drained exactly once or still queued, never lost or duplicated.
  func testConcurrentAppendsDuringDrainAreNeverLost() throws {
    let writers = 4
    let perWriter = 50
    let appended = (0..<writers).map { writer in
      (0..<perWriter).map { index in action("w\(writer)-\(index)") }
    }
    let drained = LockedList()
    let done = DispatchGroup()

    let root: URL = root
    let failures = LockedList()
    for batch in appended {
      DispatchQueue.global().async(group: done) {
        // Each writer is its own store value, as each extension process opens its own.
        let store = AppGroupStore(root: root)
        for entry in batch {
          do {
            try store.appendPendingAction(entry)
          } catch {
            failures.append(["\(entry.opId): \(error)"])
          }
        }
      }
    }
    let writersFinished = DispatchSemaphore(value: 0)
    done.notify(queue: .global()) { writersFinished.signal() }

    let drainer = AppGroupStore(root: root)
    var finished = false
    while !finished {
      finished = writersFinished.wait(timeout: .now()) == .success
      let seen = try opIds(drainer)
      drained.append(seen)
      try drainer.removePendingActions(opIds: Set(seen))
    }
    let leftover = try opIds(drainer)

    XCTAssertEqual(failures.items, [])
    let expected = appended.flatMap { $0.map(\.opId) }
    let accounted = drained.items + leftover
    XCTAssertEqual(accounted.count, expected.count, "an entry was lost or drained twice")
    XCTAssertEqual(Set(accounted), Set(expected))
    XCTAssertEqual(leftover, [])
  }
}

private final class LockedList: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [String] = []

  func append(_ more: [String]) {
    lock.lock()
    values.append(contentsOf: more)
    lock.unlock()
  }

  var items: [String] {
    lock.lock()
    defer { lock.unlock() }
    return values
  }
}
