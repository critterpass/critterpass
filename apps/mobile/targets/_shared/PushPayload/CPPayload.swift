import Foundation

/// Who a notification is from (`cp.sender`, packages/domain/src/push-payload.ts
/// `pushSenderSchema`). `avatar` is an App Group avatar key or path (`guide-tokek`,
/// `avatars/guide-tokek@3x.png`); `avatar_url`, when present, is a short-lived signed URL for an
/// avatar the app has not cached into the App Group yet.
struct CPSender: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable {
        case guide
        case member
        case system
    }

    let kind: Kind
    let id: String
    let name: String
    let avatar: String?
    let avatarUrl: String?

    enum CodingKeys: String, CodingKey {
        case kind, id, name, avatar
        case avatarUrl = "avatar_url"
    }

    init(kind: Kind, id: String, name: String, avatar: String? = nil, avatarUrl: String? = nil) {
        self.kind = kind
        self.id = id
        self.name = name
        self.avatar = avatar
        self.avatarUrl = avatarUrl
    }
}

/// The `cp` block every alert push carries (packages/domain/src/push-payload.ts `cpBlockSchema`,
/// docs/api-contracts-async.md §3.1). Unknown fields, including `ctx`, are ignored here: the
/// notification content extension and the app read `ctx` themselves.
struct CPPayload: Codable, Equatable, Sendable {
    let version: Int
    let notificationId: String
    let type: String
    let deeplink: String?
    let crewId: String?
    let tripId: String?
    let sender: CPSender
    /// false: minimal payload; the full title, body and sender come from
    /// `GET /v1/notifications/{nid}`.
    let full: Bool
    let readout: Bool?

    enum CodingKeys: String, CodingKey {
        case version = "v"
        case notificationId = "nid"
        case type, deeplink, sender, full, readout
        case crewId = "crew_id"
        case tripId = "trip_id"
    }

    /// The only `cp` version this build understands; a newer block is left to the app.
    static let supportedVersion = 1

    /// Decodes `userInfo["cp"]` of a delivered notification. Nil when the block is missing,
    /// malformed or from a newer contract version.
    init?(userInfo: [AnyHashable: Any]) {
        guard let block = userInfo["cp"], JSONSerialization.isValidJSONObject(block),
              let data = try? JSONSerialization.data(withJSONObject: block)
        else { return nil }
        guard let decoded = try? JSONDecoder().decode(CPPayload.self, from: data),
              decoded.version == Self.supportedVersion
        else { return nil }
        self = decoded
    }
}

/// `GET /v1/notifications/{id}` (services/api/src/routes/notifications.ts): the content a
/// minimal-payload push leaves out. `sender` is stored as free JSON, so a malformed one decodes to
/// nil and the push keeps the sender it arrived with.
struct CPNotificationContent: Decodable, Equatable, Sendable {
    let id: String
    let title: String
    let body: String
    let sender: CPSender?
    let threadId: String?
    let crewId: String?

    enum CodingKeys: String, CodingKey {
        case id, title, body, sender
        case threadId = "thread_id"
        case crewId = "crew_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        body = try container.decode(String.self, forKey: .body)
        sender = try? container.decodeIfPresent(CPSender.self, forKey: .sender)
        threadId = try container.decodeIfPresent(String.self, forKey: .threadId)
        crewId = try container.decodeIfPresent(String.self, forKey: .crewId)
    }

    static func decode(_ data: Data) -> CPNotificationContent? {
        try? JSONDecoder().decode(CPNotificationContent.self, from: data)
    }
}

/// `config/endpoints.json` in the App Group (docs/api-contracts-async.md §6), written by the app
/// on start so extensions never hardcode an api host.
enum AppGroupEndpoints {
    private struct File: Decodable {
        let apiBaseUrl: String

        enum CodingKeys: String, CodingKey {
            case apiBaseUrl = "api_base_url"
        }
    }

    static func apiBaseUrl(from data: Data) -> URL? {
        guard let file = try? JSONDecoder().decode(File.self, from: data),
              let url = URL(string: file.apiBaseUrl), url.scheme == "https" || url.scheme == "http"
        else { return nil }
        return url
    }

    static func apiBaseUrl(containerUrl: URL?) -> URL? {
        guard let containerUrl,
              let data = try? Data(contentsOf: containerUrl.appendingPathComponent("config/endpoints.json"))
        else { return nil }
        return apiBaseUrl(from: data)
    }
}
