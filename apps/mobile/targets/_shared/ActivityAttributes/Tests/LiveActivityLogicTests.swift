#if CP_TARGET_TESTS
import XCTest

@testable import LiveActivityLogicCore

final class LiveActivityLogicTests: XCTestCase {
    /// Vectors from packages/domain `laMemberHash`: the phone must find itself in a frame the
    /// server hashed.
    func testMemberHashMatchesTheServers() {
        XCTAssertEqual(
            LAMemberHash.of(
                scope: "0199a3c0-0000-7000-8000-00000000c001",
                uid: "0199a3c0-0000-7000-8000-00000000d001"),
            "bfe0e678")
        XCTAssertEqual(LAMemberHash.of(scope: "poll", uid: "Đà Nẵng"), "9d8d1e80")
        XCTAssertEqual(LAMemberHash.of(scope: "", uid: "").count, 8)
    }

    func testCrewLineRunsFromTheFarEndToTheFlag() {
        let dots = MeetUpLane.dots(steps: [10, 5, 0])
        XCTAssertEqual(dots.map(\.x), [0, 0.5, 1])
        XCTAssertEqual(dots.map(\.row), [0, 0, 0])
        XCTAssertEqual(dots.map(\.member), [0, 1, 2])
    }

    func testMembersOnOneStepFanOutInsteadOfCoveringEachOther() {
        let dots = MeetUpLane.dots(steps: [3, 3, 3, 3, 3, 7])
        XCTAssertEqual(dots.map(\.row), [0, -1, 1, -2, 2, 0])
        XCTAssertEqual(Set(dots.prefix(5).map(\.x)).count, 1)
    }

    func testAStepOutsideTheLineIsPinnedToItsEnds() {
        XCTAssertEqual(MeetUpLane.dots(steps: [-4, 99]).map(\.x), [1, 0])
    }

    func testRingFillsInTenStepsAndTheSilhouetteSharpens() {
        XCTAssertEqual((0...10).map(CritterRing.fraction(ring:)), (0...10).map { Double($0) / 10 })
        XCTAssertEqual(CritterRing.fraction(ring: 14), 1)
        XCTAssertEqual(CritterRing.fraction(ring: -1), 0)
        XCTAssertEqual(CritterRing.blurRadius(stage: 0, size: 40), 0)
        XCTAssertGreaterThan(
            CritterRing.blurRadius(stage: 3, size: 40), CritterRing.blurRadius(stage: 1, size: 40))
        XCTAssertEqual(
            CritterRing.blurRadius(stage: 9, size: 40), CritterRing.blurRadius(stage: 3, size: 40))
    }

    func testAVoteIsCountedOnceAndOnlyWhenTheViewerHadNotVoted() {
        let tallies = [(optionId: "a", count: 2), (optionId: "b", count: 1)]
        XCTAssertEqual(VoteBoard.counting(vote: "b", tallies: tallies, alreadyVoted: false), [2, 2])
        XCTAssertEqual(VoteBoard.counting(vote: "b", tallies: tallies, alreadyVoted: true), [2, 1])
        XCTAssertEqual(VoteBoard.share(count: 2, of: [2, 1, 1]), 0.5)
        XCTAssertEqual(VoteBoard.share(count: 0, of: [0, 0]), 0)
    }

    func testTheViewerIsFoundAmongTheVotersByHash() {
        let mine = LAMemberHash.of(scope: "poll", uid: "me")
        XCTAssertTrue(VoteBoard.viewerVoted(voted: ["00000000", mine], pollId: "poll", uid: "me"))
        XCTAssertFalse(VoteBoard.viewerVoted(voted: [mine], pollId: "other", uid: "me"))
        XCTAssertFalse(VoteBoard.viewerVoted(voted: [mine], pollId: "poll", uid: nil))
    }

    func testFareReadsAsARangeOrOneFigure() {
        let us = Locale(identifier: "en_US")
        XCTAssertEqual(RideFare.text(low: 4, high: 6, currency: "USD", locale: us), "$4–6")
        XCTAssertEqual(RideFare.text(low: 4.5, high: 4.5, currency: "USD", locale: us), "$4.50")
        // The system puts a no-break space between a currency code and its amount.
        XCTAssertEqual(
            RideFare.text(low: 60000, high: 75000, currency: "IDR", locale: us),
            "IDR\u{00A0}60,000–75,000")
    }

    func testEachAppVariantsExtensionOpensItsOwnApp() {
        XCTAssertEqual(LADeepLink.scheme(bundleId: "app.critterpass.CritterpassWidgets"), "critterpass")
        XCTAssertEqual(LADeepLink.scheme(bundleId: "app.critterpass.staging.CritterpassWidgets"), "critterpass-staging")
        XCTAssertEqual(LADeepLink.scheme(bundleId: "app.critterpass.dev.CritterpassWidgets"), "critterpass-dev")
        XCTAssertEqual(
            LADeepLink.url(route: "vote/abc", bundleId: "app.critterpass.staging.widgets")?.absoluteString,
            "critterpass-staging://vote/abc")
    }
}
#endif
