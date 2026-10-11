#if CP_TARGET_TESTS
import XCTest

@testable import NotificationContentCore

final class PosterModelTests: XCTestCase {
    private let pollId = "0199a3c0-0000-7000-8000-00000000a001"

    private func vote(options: [(String, String)], stamp: String? = nil) -> PosterContent? {
        var info: [AnyHashable: Any] = [
            "cp": [
                "v": 1, "type": "vote.needs_you",
                "ctx": [
                    "poll_id": pollId,
                    "options": options.map { ["id": $0.0, "label": $0.1] },
                ],
            ],
        ]
        if let stamp { info[PosterContent.stampKey] = stamp }
        return PosterContent(
            category: "cp.vote", title: "The Bali Six · Final vote", body: "Three of six have voted.",
            userInfo: info)
    }

    func testVoteButtonsNameTheOptionsUpToThreeThenOpen() throws {
        let poster = try XCTUnwrap(vote(options: [("o1", "Kyoto"), ("o2", "Lisbon")]))
        XCTAssertEqual(poster.actions(answered: false).map(\.id), ["VOTE_1", "VOTE_2", "OPEN"])
        XCTAssertEqual(poster.actions(answered: false).first?.title, "Vote Kyoto")
        XCTAssertEqual(poster.actions(answered: false).last?.foreground, true)

        let crowded = try XCTUnwrap(
            vote(options: [("a", "A"), ("b", "B"), ("c", "C"), ("d", "D")]))
        XCTAssertEqual(
            crowded.actions(answered: false).map(\.id), ["VOTE_1", "VOTE_2", "VOTE_3", "OPEN"])
    }

    func testAButtonCastsItsOwnOptionAndNothingElseCasts() throws {
        let poster = try XCTUnwrap(vote(options: [("o1", "Kyoto"), ("o2", "Lisbon")]))
        XCTAssertEqual(poster.answer(for: "VOTE_2"), .vote(pollId: pollId, optionId: "o2"))
        XCTAssertNil(poster.answer(for: "VOTE_3"))
        XCTAssertNil(poster.answer(for: "OPEN"))
        XCTAssertNil(poster.answer(for: "VOTE_0"))
    }

    func testAnAnsweredOrRepostedPosterOnlyOpens() throws {
        let poster = try XCTUnwrap(vote(options: [("o1", "Kyoto"), ("o2", "Lisbon")]))
        XCTAssertEqual(poster.actions(answered: true).map(\.id), ["OPEN"])
        let reposted = try XCTUnwrap(vote(options: [("o1", "Kyoto")], stamp: "o1"))
        XCTAssertEqual(reposted.stamped, "o1")
        XCTAssertEqual(reposted.actions(answered: false).map(\.id), ["OPEN"])
    }

    func testAPushWithoutAPollIsNoPoster() {
        XCTAssertNil(PosterContent(category: "cp.vote", title: "", body: "", userInfo: [:]))
        XCTAssertNil(PosterContent(category: "cp.chat", title: "", body: "", userInfo: [:]))
    }

    func testRsvpOffersInAndMaybeOnlyWithAProposal() throws {
        let info: [AnyHashable: Any] = ["cp": ["ctx": ["proposal_id": "p1"]]]
        let rsvp = try XCTUnwrap(
            PosterContent(category: "cp.rsvp", title: "Bali in March", body: "", userInfo: info))
        XCTAssertEqual(rsvp.actions(answered: false).map(\.id), ["IN", "MAYBE", "OPEN"])
        XCTAssertEqual(rsvp.answer(for: "IN"), .rsvp(proposalId: "p1", status: "in"))
        XCTAssertNil(rsvp.answer(for: "OUT"))

        let bare = try XCTUnwrap(
            PosterContent(category: "cp.rsvp", title: "Bali in March", body: "", userInfo: [:]))
        XCTAssertEqual(bare.actions(answered: false).map(\.id), ["OPEN"])
        XCTAssertNil(bare.answer(for: "IN"))
    }

    func testReadsTheTalliesFromAnAcceptedBallot() {
        let body = Data(#"""
        {"op_id":"x","status":"applied","result":{"poll_id":"p","status":"open","stage":"final",
         "option_tallies":{"o1":2,"o2":1},"pending_count":3,"eligible_count":6,
         "my_option_id":"o1","winner_option_id":null}}
        """#.utf8)
        XCTAssertEqual(
            PosterOutcome.parse(statusCode: 200, body: body),
            .accepted(tallies: ["o1": 2, "o2": 1], closed: false, winner: nil))
    }

    func testAClosedVoteShowsTheResultInsteadOfAnError() throws {
        let body = Data(#"""
        {"error":{"code":"VOTE_CLOSED","message":"closed","retryable":false,
         "detail":{"result":{"status":"closed","option_tallies":{"o1":4,"o2":2},
                             "winner_option_id":"o1"}}}}
        """#.utf8)
        let outcome = PosterOutcome.parse(statusCode: 409, body: body)
        XCTAssertEqual(outcome, .closed(tallies: ["o1": 4, "o2": 2], winner: "o1"))

        let poster = try XCTUnwrap(vote(options: [("o1", "Bali"), ("o2", "Lisbon")]))
        XCTAssertEqual(
            poster.stampLine(answer: .vote(pollId: pollId, optionId: "o2"), outcome: outcome),
            "Vote closed: Bali won. Bali 4 · Lisbon 2")
    }

    func testARefusedKeyIsNotACountedVote() {
        let body = Data(#"{"error":{"code":"ACTION_KEY_SCOPE","message":"no","retryable":false}}"#.utf8)
        XCTAssertEqual(PosterOutcome.parse(statusCode: 403, body: body), .refused(code: "ACTION_KEY_SCOPE"))
        XCTAssertNil(PosterOutcome.parse(statusCode: 502, body: Data("Bad gateway".utf8)))
    }

    func testTheRepostedLineSaysWhatHappened() throws {
        let poster = try XCTUnwrap(vote(options: [("o1", "Kyoto"), ("o2", "Lisbon")]))
        let answer = PosterAnswer.vote(pollId: pollId, optionId: "o1")
        XCTAssertEqual(
            poster.stampLine(
                answer: answer, outcome: .accepted(tallies: ["o1": 3, "o2": 1], closed: false, winner: nil)),
            "You voted Kyoto. Kyoto 3 · Lisbon 1")
        XCTAssertEqual(
            poster.stampLine(answer: answer, outcome: nil),
            "You voted Kyoto. Sending when you're back online.")
    }

    private func changeset(_ diff: [[String: Any]]) -> PosterContent? {
        PosterContent(
            category: "cp.changeset", title: "Swap the ridge and the market?", body: "Tokek has a change.",
            userInfo: [
                "cp": [
                    "v": 1, "type": "changeset_needs_yes",
                    "ctx": [
                        "change_set_id": "cs1", "diff": diff, "yes_count": 2, "needed": 3,
                        "closes_at": 1_760_000_000,
                        "voters": [["initial": "M", "tone": "pink"], ["initial": ""]],
                    ],
                ],
            ])
    }

    func testAChangeAsksYesSwapOnlyWhenTwoStopsTradeTimesAndLeavesTheAnswerToTheApp() throws {
        let swap = try XCTUnwrap(changeset([
            ["label": "Ridge walk", "from": "13:00", "to": "16:00"],
            ["label": "Ubud market", "from": "16:00", "to": "13:00"],
        ]))
        XCTAssertEqual(swap.actions(answered: false).map(\.id), ["APPROVE", "DECLINE", "OPEN"])
        XCTAssertEqual(swap.actions(answered: false).map(\.title), ["Yes, swap", "Not this one", "Open the plan"])
        XCTAssertNil(swap.answer(for: "APPROVE"))
        guard case .changeset(let change) = swap.kind else { return XCTFail("not a change") }
        XCTAssertEqual(change.yesCount, 2)
        XCTAssertEqual(change.needed, 3)
        XCTAssertEqual(change.voters, [.init(initial: "M", tone: "pink")])

        let added = try XCTUnwrap(changeset([["label": "Spa", "from": NSNull(), "to": "15:00"]]))
        XCTAssertEqual(added.actions(answered: false).first?.title, "Yes")
    }

    func testTheRoundupKeepsItsRowsAndOnlyOpens() throws {
        let poster = try XCTUnwrap(PosterContent(
            category: "cp.roundup", title: "Tokek's roundup", body: "Bookings found, Kyoto invite",
            userInfo: ["cp": ["v": 1, "type": "evening_roundup", "ctx": [
                "subtitle": "Five small things from today",
                "lines": [["kind": "booking_found", "title": "2 bookings found", "sub": "Check them"],
                          ["kind": "quest", "title": "3 quests done"], ["sub": "no title"]],
            ]]]))
        guard case .roundup(let subtitle, let lines) = poster.kind else { return XCTFail("not a roundup") }
        XCTAssertEqual(subtitle, "Five small things from today")
        XCTAssertEqual(lines.map(\.title), ["2 bookings found", "3 quests done"])
        XCTAssertEqual(poster.actions(answered: false).map(\.id), ["OPEN"])
    }

    func testTheVoteCaptionCountsTurnoutAndTheClosingDay() throws {
        let now = Date(timeIntervalSince1970: 1_760_000_000)
        var poster = try XCTUnwrap(vote(options: [("o1", "Kyoto")]))
        XCTAssertNil(poster.turnoutLine(now: now))
        poster.turnout = .init(voted: 3, eligible: 6, closesAt: now.addingTimeInterval(-60))
        XCTAssertEqual(poster.turnoutLine(now: now), "3 of 6 have voted.")
        poster.turnout.closesAt = now.addingTimeInterval(3 * 86_400)
        XCTAssertTrue(poster.turnoutLine(now: now)?.hasPrefix("3 of 6 have voted. It closes ") == true)
    }
}
#endif
