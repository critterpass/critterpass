#if CP_TARGET_TESTS
import XCTest

@testable import NotificationServiceCore

/// Payload fixtures in the shapes the worker sends (services/worker/src/push/payload.ts) and the
/// api answers (services/api/src/routes/notifications.ts).
private enum Fixture {
    static let crewId = "0192f0c4-7a1e-7c3d-9a51-2b7d4e1f6a10"
    static let tripId = "0192f0c4-7a1e-7c3d-9a51-2b7d4e1f6a11"
    static let nid = "0192f0c4-7a1e-7c3d-9a51-2b7d4e1f6a12"

    static func userInfo(_ json: String) -> [AnyHashable: Any] {
        let object = try! JSONSerialization.jsonObject(with: Data(json.utf8))
        return object as! [AnyHashable: Any]
    }

    static var guideVote: [AnyHashable: Any] {
        userInfo("""
    {"aps": {"alert": {"title": "Boat day closes Friday", "body": "Penida leads 4–2."},
             "category": "cp.vote", "mutable-content": 1},
     "cp": {"v": 1, "nid": "\(nid)", "type": "vote_needs_you",
            "deeplink": "critterpass://crew/\(crewId)/vote/1", "crew_id": "\(crewId)",
            "trip_id": "\(tripId)",
            "sender": {"kind": "guide", "id": "tokek", "name": "Tokek",
                       "avatar": "avatars/guide-tokek@3x.png"},
            "ctx": {"poll_id": "p1", "options": [{"id": "a", "label": "Nusa Penida"}]},
            "full": true}}
    """)
    }

    static var memberPrivate: [AnyHashable: Any] {
        userInfo("""
    {"aps": {"alert": {"title": "Maya", "body": "New message"}, "mutable-content": 1},
     "cp": {"v": 1, "nid": "\(nid)", "type": "crew_chat", "crew_id": "\(crewId)",
            "sender": {"kind": "member", "id": "u-maya", "name": "Maya"}, "full": false}}
    """)
    }

    static var guideDirect: [AnyHashable: Any] {
        userInfo("""
    {"aps": {"alert": {"title": "Tokek", "body": "Your pickup moved to 22:40."}},
     "cp": {"v": 1, "nid": "\(nid)", "type": "guide_note",
            "sender": {"kind": "guide", "id": "tokek", "name": "Tokek"}, "full": true}}
    """)
    }

    static var system: [AnyHashable: Any] {
        userInfo("""
    {"aps": {"alert": {"title": "Receipt", "body": "Pass+ renewed."}},
     "cp": {"v": 1, "nid": "\(nid)", "type": "billing_receipt",
            "sender": {"kind": "system", "id": "critterpass", "name": "CritterPass"},
            "full": true}}
    """)
    }

    static var crews: Data {
        Data("""
    {"schema": 1, "generated_at": "2026-09-28T04:00:00Z",
     "crews": {"\(crewId)": {"name": "The Bali Six",
                             "members": {"u-maya": {"first_name": "Maya", "avatar": "u-maya"}}}}}
    """.utf8)
    }
}

final class CPPayloadTests: XCTestCase {
    func testDecodesAFullGuidePush() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.guideVote))
        XCTAssertEqual(payload.version, 1)
        XCTAssertEqual(payload.notificationId, Fixture.nid)
        XCTAssertEqual(payload.type, "vote_needs_you")
        XCTAssertEqual(payload.crewId, Fixture.crewId)
        XCTAssertTrue(payload.full)
        XCTAssertEqual(
            payload.sender,
            CPSender(kind: .guide, id: "tokek", name: "Tokek", avatar: "avatars/guide-tokek@3x.png")
        )
    }

    func testDecodesAMinimalPayloadPush() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.memberPrivate))
        XCTAssertFalse(payload.full)
        XCTAssertEqual(payload.sender.kind, .member)
        XCTAssertNil(payload.sender.avatar)
    }

    func testRejectsMissingMalformedAndNewerBlocks() {
        XCTAssertNil(CPPayload(userInfo: ["aps": ["alert": "hi"]]))
        XCTAssertNil(CPPayload(userInfo: ["cp": ["v": 1, "nid": Fixture.nid]]))
        var newer = Fixture.guideDirect
        var block = newer["cp"] as! [String: Any]
        block["v"] = 2
        newer["cp"] = block
        XCTAssertNil(CPPayload(userInfo: newer))
    }

    func testDecodesTheFetchedNotificationContent() throws {
        let body = Data("""
        {"id": "\(Fixture.nid)", "key": "crew_chat", "category": "cp.chat",
         "title": "Maya", "body": "who's up for the spa on day 3?",
         "sender": {"kind": "member", "id": "u-maya", "name": "Maya",
                    "avatar_url": "https://media.critterpass.app/a/u-maya.png?sig=abc"},
         "ctx": {}, "items": null, "deep_link": null, "thread_id": "\(Fixture.crewId)",
         "crew_id": "\(Fixture.crewId)", "trip_id": null, "created_at": "2026-09-28T04:00:00.000Z"}
        """.utf8)
        let content = try XCTUnwrap(CPNotificationContent.decode(body))
        XCTAssertEqual(content.body, "who's up for the spa on day 3?")
        XCTAssertEqual(content.threadId, Fixture.crewId)
        XCTAssertEqual(content.sender?.avatarUrl, "https://media.critterpass.app/a/u-maya.png?sig=abc")
    }

    func testAMalformedFetchedSenderKeepsTheContent() throws {
        let body = Data("""
        {"id": "\(Fixture.nid)", "title": "Maya", "body": "hi", "sender": {"kind": "robot"},
         "thread_id": null, "crew_id": null}
        """.utf8)
        let content = try XCTUnwrap(CPNotificationContent.decode(body))
        XCTAssertNil(content.sender)
        XCTAssertEqual(content.title, "Maya")
    }

    func testReadsTheApiBaseUrlFromEndpointsConfig() {
        let data = Data("""
        {"schema": 1, "generated_at": "2026-09-28T04:00:00Z", "env": "staging",
         "api_base_url": "https://api-staging.critterpass.app", "schemas": {}}
        """.utf8)
        XCTAssertEqual(
            AppGroupEndpoints.apiBaseUrl(from: data)?.absoluteString,
            "https://api-staging.critterpass.app"
        )
        XCTAssertNil(AppGroupEndpoints.apiBaseUrl(from: Data(#"{"api_base_url": "file:///etc"}"#.utf8)))
    }
}

final class SenderIdentityTests: XCTestCase {
    private var crews: CrewDirectory { CrewDirectory.decode(Fixture.crews)! }

    func testAGuideInACrewIsDisclosedAndGroupedUnderTheCrew() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.guideVote))
        let identity = try XCTUnwrap(
            SenderIdentity(payload: payload, recipientUserId: "u-rin", crews: crews)
        )
        XCTAssertEqual(identity.handle, "cp-guide:tokek")
        XCTAssertEqual(identity.displayName, "Tokek · AI guide")
        XCTAssertEqual(identity.conversationIdentifier, Fixture.crewId)
        XCTAssertEqual(identity.groupName, "The Bali Six")
        XCTAssertEqual(
            identity.avatarKey(crews: crews, crewId: payload.crewId),
            "avatars/guide-tokek@3x.png"
        )
    }

    func testAOneToOneGuideThreadIsKeyedByGuideAndRecipient() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.guideDirect))
        let identity = try XCTUnwrap(
            SenderIdentity(payload: payload, recipientUserId: "u-rin", crews: nil)
        )
        XCTAssertEqual(identity.conversationIdentifier, "guide:tokek:u-rin")
        XCTAssertNil(identity.groupName)
    }

    func testAMemberTakesTheirAvatarKeyFromTheCrewDirectory() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.memberPrivate))
        let identity = try XCTUnwrap(
            SenderIdentity(payload: payload, recipientUserId: "u-rin", crews: crews)
        )
        XCTAssertEqual(identity.handle, "cp-user:u-maya")
        XCTAssertEqual(identity.displayName, "Maya")
        XCTAssertEqual(identity.avatarKey(crews: crews, crewId: payload.crewId), "u-maya")
        XCTAssertNil(identity.avatarKey(crews: nil, crewId: payload.crewId))
    }

    func testSystemNotificationsStayPlainAlerts() throws {
        let payload = try XCTUnwrap(CPPayload(userInfo: Fixture.system))
        XCTAssertNil(SenderIdentity(payload: payload, recipientUserId: "u-rin", crews: crews))
    }

    func testCrewDirectoryRejectsAnUnknownSchema() {
        let newer = Data(#"{"schema": 9, "generated_at": "2026-09-28T04:00:00Z", "crews": {}}"#.utf8)
        XCTAssertNil(CrewDirectory.decode(newer))
    }
}

final class AvatarLoaderTests: XCTestCase {
    private let container = URL(fileURLWithPath: "/group")

    func testAppGroupPathsStayInsideTheAvatarsFolder() {
        XCTAssertEqual(
            AvatarLoader.appGroupRelativePath(forKey: "guide-tokek"),
            "assets/avatars/guide-tokek@3x.png"
        )
        XCTAssertEqual(
            AvatarLoader.appGroupRelativePath(forKey: "avatars/guide-tokek@3x.png"),
            "assets/avatars/guide-tokek@3x.png"
        )
        XCTAssertNil(AvatarLoader.appGroupRelativePath(forKey: "../config/endpoints.json"))
        XCTAssertNil(AvatarLoader.appGroupRelativePath(forKey: "avatars/../../x.png"))
    }

    func testPrefersTheCachedAvatarThenTheSignedUrlThenTheGuideArt() {
        let cached = AvatarLoader(containerUrl: container, fileExists: { _ in true })
        let signed = "https://media.critterpass.app/a/u-maya.png?sig=abc"
        XCTAssertEqual(
            cached.sources(avatarKey: "u-maya", signedUrl: signed),
            [
                .appGroup(URL(fileURLWithPath: "/group/assets/avatars/u-maya@3x.png")),
                .remote(URL(string: signed)!),
                .guideDefault,
            ]
        )
        let uncached = AvatarLoader(containerUrl: container, fileExists: { _ in false })
        XCTAssertEqual(
            uncached.sources(avatarKey: "u-maya", signedUrl: nil),
            [.guideDefault]
        )
        XCTAssertEqual(
            uncached.sources(avatarKey: "http://insecure.example/a.png", signedUrl: "file:///a.png"),
            [.guideDefault]
        )
    }

    func testFallsBackToTheGuideArtWhenTheDownloadFails() async {
        let loader = AvatarLoader(containerUrl: nil, fileExists: { _ in false })
        let guideArt = Data([0x89, 0x50, 0x4E, 0x47])
        let failed = await loader.load(
            avatarKey: nil,
            signedUrl: "https://media.critterpass.app/a/u-maya.png",
            fetch: { _ in nil },
            guideDefault: { guideArt }
        )
        XCTAssertEqual(failed, guideArt)

        let photo = Data([1, 2, 3])
        let downloaded = await loader.load(
            avatarKey: nil,
            signedUrl: "https://media.critterpass.app/a/u-maya.png",
            fetch: { _ in photo },
            guideDefault: { guideArt }
        )
        XCTAssertEqual(downloaded, photo)
    }

    func testReadsTheCachedAvatarFromTheAppGroup() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("cp-avatar-\(UUID().uuidString)")
        let avatars = root.appendingPathComponent("assets/avatars")
        try FileManager.default.createDirectory(at: avatars, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let face = Data([7, 7, 7])
        try face.write(to: avatars.appendingPathComponent("guide-tokek@3x.png"))

        let loaded = await AvatarLoader(containerUrl: root).load(
            avatarKey: "guide-tokek",
            signedUrl: nil,
            fetch: { _ in XCTFail("no download when the App Group has the avatar"); return nil },
            guideDefault: { nil }
        )
        XCTAssertEqual(loaded, face)
    }
}
#endif
