#if CP_TARGET_TESTS
import XCTest

@testable import AppClipCore

final class ClipLinkTests: XCTestCase {
    private let seat = String(repeating: "A", count: 22) + String(repeating: "b", count: 22) + "k1"

    func testReadsAnInviteWithItsSeatAndChannel() throws {
        let url = try XCTUnwrap(URL(string: "https://go.critterpass.app/i/bax-6xa/\(seat)?c=wa"))
        let link = try XCTUnwrap(ClipLink(url: url))
        XCTAssertEqual(link.kind, .invite)
        XCTAssertEqual(link.code, "BAX6XA")
        XCTAssertEqual(link.seat, seat)
        XCTAssertEqual(link.channel, "wa")
        XCTAssertEqual(link.url, url)
        XCTAssertEqual(
            link.previewUrl.absoluteString,
            "https://api.critterpass.app/v1/links/BAX6XA/preview?kind=invite&seat=\(seat)&c=wa"
        )
    }

    func testPreviewsStagingLinksOnTheStagingApi() throws {
        let link = try XCTUnwrap(ClipLink(url: URL(string: "https://staging.critterpass.app/j/BAX6XA")!))
        XCTAssertEqual(
            link.previewUrl.absoluteString,
            "https://api-staging-de92.up.railway.app/v1/links/BAX6XA/preview?kind=invite"
        )
        let referral = try XCTUnwrap(ClipLink(url: URL(string: "https://critterpass.app/r/K7M2QX")!))
        XCTAssertEqual(referral.kind, .referral)
        XCTAssertNil(referral.channel)
    }

    func testRefusesForeignHostsBadCodesAndOtherLinkKinds() {
        let refused = [
            "https://evil.example/i/BAX6XA",
            "http://critterpass.app/i/BAX6XA",
            "https://critterpass.app/i/BAX6X0",
            "https://critterpass.app/i/BAX6XA/not-a-seat",
            "https://critterpass.app/plan/0199a000-0000-7000-8000-000000000001",
            "https://critterpass.app/",
        ]
        for raw in refused {
            XCTAssertNil(ClipLink(url: URL(string: raw)!), raw)
        }
        let unknownChannel = ClipLink(url: URL(string: "https://critterpass.app/i/BAX6XA?c=fax")!)
        XCTAssertNil(unknownChannel?.channel)
    }
}

final class TicketContentTests: XCTestCase {
    private let link = ClipLink(url: URL(string: "https://critterpass.app/i/BAX6XA")!)!

    func testPrintsTheTicketFromThePreview() throws {
        let preview = try XCTUnwrap(ClipPreview.decode(Data("""
        {"kind": "invite", "crew_name": "The Bali Six", "inviter_first_name": "Winston",
         "trip_place": "Bali", "members_count": 4, "expires_at": "2026-10-12T00:00:00.000Z",
         "state": "active"}
        """.utf8)))
        let ticket = TicketContent(link: link, preview: preview)
        XCTAssertEqual(ticket.headline, "Winston saved you a seat")
        XCTAssertEqual(ticket.crewName, "The Bali Six")
        XCTAssertEqual(ticket.destination, "BALI")
        XCTAssertEqual(ticket.seatsLine, "4 already in")
        XCTAssertEqual(ticket.code, "BAX6XA")
        XCTAssertTrue(ticket.isOpen)
    }

    func testReadsWellWithoutAPreviewAndMarksClosedInvites() throws {
        let bare = TicketContent(link: link, preview: nil)
        XCTAssertEqual(bare.headline, "You’re invited")
        XCTAssertEqual(bare.crewName, "Crew ticket")
        XCTAssertNil(bare.seatsLine)
        XCTAssertTrue(bare.isOpen)

        let revoked = try XCTUnwrap(ClipPreview.decode(Data("""
        {"kind": "invite", "crew_name": null, "inviter_first_name": null, "trip_place": null,
         "members_count": null, "expires_at": null, "state": "revoked"}
        """.utf8)))
        XCTAssertFalse(TicketContent(link: link, preview: revoked).isOpen)
    }
}

final class ClipLinkHandoffTests: XCTestCase {
    func testWritesTheOpenedLinkForTheFullApp() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("cp-clip-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let url = URL(string: "https://critterpass.app/i/BAX6XA?c=imsg")!
        let now = ISO8601DateFormatter().date(from: "2026-09-28T04:00:00Z")!

        XCTAssertTrue(ClipLinkHandoff.write(url: url, containerUrl: root, now: now))
        let data = try Data(contentsOf: root.appendingPathComponent("state/clip-link.json"))
        let file = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(file["schema"] as? Int, 1)
        XCTAssertEqual(file["url"] as? String, url.absoluteString)
        XCTAssertEqual(file["generated_at"] as? String, "2026-09-28T04:00:00.000Z")
        XCTAssertFalse(ClipLinkHandoff.write(url: url, containerUrl: nil, now: now))
    }
}
#endif
