import XCTest

@testable import CpLiveActivityCore

/// A dismissal is final on the server, so only a user swiping away a showing activity may be
/// reported as one; everything else the system does to an activity must read as something milder.
final class LiveActivityLedgerTests: XCTestCase {
    func testUserSwipingAwayAShowingActivityIsADismissal() {
        var ledger = LiveActivityLedger()
        XCTAssertEqual(ledger.report("a", .active), .active)
        XCTAssertEqual(ledger.report("a", .dismissed), .dismissed)
        XCTAssertNil(ledger.report("a", .dismissed))
    }

    func testTheSystemClearingAnEndedActivityIsNotADismissal() {
        var ledger = LiveActivityLedger()
        XCTAssertEqual(ledger.report("a", .active), .active)
        XCTAssertEqual(ledger.report("a", .ended), .ended)
        XCTAssertNil(ledger.report("a", .dismissed))
    }

    func testAnActivityFirstSeenDismissedReadsAsEnded() {
        var ledger = LiveActivityLedger()
        XCTAssertEqual(ledger.report("a", .dismissed), .ended)
        XCTAssertNil(ledger.report("a", .dismissed))
    }

    func testAClosedActivityNeverReadsAsShowingAgain() {
        var ledger = LiveActivityLedger()
        XCTAssertEqual(ledger.report("a", .ended), .ended)
        XCTAssertNil(ledger.report("a", .active))
        XCTAssertNil(ledger.report("a", .stale))
    }

    func testPendingIsNeverReportedAndRepeatsAreQuiet() {
        var ledger = LiveActivityLedger()
        XCTAssertNil(ledger.report("a", .pending))
        XCTAssertEqual(ledger.report("a", .active), .active)
        XCTAssertNil(ledger.report("a", .active))
        XCTAssertEqual(ledger.report("a", .stale), .stale)
        XCTAssertEqual(ledger.report("a", .active), .active)
        XCTAssertEqual(ledger.report("b", .stale), .stale)
    }

    func testTokensAreLowercaseHex() {
        XCTAssertEqual(Data([0x0a, 0xff, 0x00]).hexToken, "0aff00")
    }
}
