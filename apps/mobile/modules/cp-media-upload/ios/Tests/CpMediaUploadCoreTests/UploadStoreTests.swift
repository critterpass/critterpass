import Foundation
import XCTest

@testable import CpMediaUploadCore

final class UploadStoreTests: XCTestCase {
  private func job() -> UploadJob {
    UploadJob(
      id: "p1", filePath: "/tmp/p1.jpg", contentType: "image/jpeg",
      parts: [
        UploadPart(partNumber: 1, url: "https://r2/1", offset: 0, length: 10, etag: nil, state: .pending),
        UploadPart(partNumber: 2, url: "https://r2/2", offset: 10, length: 5, etag: nil, state: .pending),
      ], failure: nil)
  }

  private func storeURL() -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("upload-store-\(UUID().uuidString)/uploads.json")
  }

  func testAKilledUploadResumesOnlyItsUnfinishedParts() {
    let url = storeURL()
    let first = UploadStore(url: url)
    first.put(job())
    first.change("p1") { $0.markDone(part: 1, etag: "\"e1\"") }
    first.change("p1") { $0.update(part: 2) { $0.state = .uploading } }

    // A new process reads the same file: part 1 is kept, part 2 failed when the app was killed.
    let relaunched = UploadStore(url: url)
    relaunched.change("p1") { $0.markFailed(part: 2, reason: "network") }
    var resumed = relaunched.job("p1")!
    XCTAssertEqual(resumed.state, "failed")
    resumed.retry(urls: [2: "https://r2/2-fresh"])
    XCTAssertEqual(resumed.pendingParts.map(\.partNumber), [2])
    XCTAssertEqual(resumed.pendingParts.first?.url, "https://r2/2-fresh")
    XCTAssertEqual(resumed.parts.first?.etag, "\"e1\"")
    XCTAssertNil(resumed.failure)
  }

  func testAJobIsDoneOnlyWhenEveryPartHasItsEtag() {
    var upload = job()
    upload.markDone(part: 1, etag: "a")
    XCTAssertEqual(upload.state, "uploading")
    XCTAssertEqual(upload.sentBytes, 10)
    upload.markDone(part: 2, etag: "b")
    XCTAssertEqual(upload.state, "done")
    XCTAssertEqual(upload.sentBytes, upload.totalBytes)
  }

  func testRemoveForgetsTheJob() {
    let store = UploadStore(url: storeURL())
    store.put(job())
    store.remove("p1")
    XCTAssertTrue(store.all().isEmpty)
  }
}
