import Foundation

/// The communication-notification identity of a push (docs/api-contracts-async.md §3.1): the
/// `INPerson` handle and name, the conversation it belongs to and the group name iOS shows above
/// it. Pure data, built from the `cp` block plus the App Group's crew directory, so it is tested
/// on payload fixtures without Intents or a device.
struct SenderIdentity: Equatable, Sendable {
    /// `cp-guide:<guide_id>` or `cp-user:<uid>`.
    let handle: String
    /// Guide personas always carry the AI disclosure ("Tokek · AI guide").
    let displayName: String
    /// The crew id, or `guide:<guide_id>:<uid>` for a one-to-one guide thread.
    let conversationIdentifier: String
    /// The crew name for crew threads; nil for one-to-one threads.
    let groupName: String?
    let sender: CPSender

    var isGuide: Bool { sender.kind == .guide }

    /// Nil for system notifications (billing, account): they have no person behind them and stay
    /// plain alerts.
    init?(payload: CPPayload, recipientUserId: String?, crews: CrewDirectory?) {
        self.init(
            sender: payload.sender, crewId: payload.crewId, recipientUserId: recipientUserId,
            crews: crews
        )
    }

    init?(sender: CPSender, crewId: String?, recipientUserId: String?, crews: CrewDirectory?) {
        switch sender.kind {
        case .system:
            return nil
        case .guide:
            handle = "cp-guide:\(sender.id)"
            displayName = Self.guideDisplayName(sender.name)
        case .member:
            handle = "cp-user:\(sender.id)"
            displayName = sender.name
        }
        self.sender = sender

        if let crewId {
            conversationIdentifier = crewId
            groupName = crews?.crewName(crewId)
        } else if sender.kind == .guide {
            conversationIdentifier = ["guide", sender.id, recipientUserId]
                .compactMap { $0 }
                .joined(separator: ":")
            groupName = nil
        } else {
            conversationIdentifier = "user:\(sender.id)"
            groupName = nil
        }
    }

    static func guideDisplayName(_ name: String) -> String {
        let format = NSLocalizedString(
            "sender.guide.display_name",
            value: "%@ · AI guide",
            comment: "A guide persona's name in a notification, with the AI disclosure"
        )
        return String(format: format, name)
    }

    /// The App Group avatar key for this sender: the push's own, else the crew directory's.
    func avatarKey(crews: CrewDirectory?, crewId: String?) -> String? {
        if let avatar = sender.avatar, !avatar.isEmpty { return avatar }
        guard sender.kind == .member, let crewId else { return nil }
        return crews?.memberAvatarKey(crewId: crewId, userId: sender.id)
    }
}

/// `snapshot/crews.json` in the App Group (docs/api-contracts-async.md §6): crew id → name, and
/// each member's first name and avatar key, written by the app for extensions.
/// `{"schema": 1, "generated_at": ISO, "crews": {"<crew_id>": {"name": "…",
/// "members": {"<uid>": {"first_name": "…", "avatar": "<key>"}}}}}`.
struct CrewDirectory: Decodable, Equatable, Sendable {
    struct Crew: Decodable, Equatable, Sendable {
        let name: String
        let members: [String: Member]?
    }

    struct Member: Decodable, Equatable, Sendable {
        let firstName: String?
        let avatar: String?

        enum CodingKeys: String, CodingKey {
            case firstName = "first_name"
            case avatar
        }
    }

    static let supportedSchemas = 1...1
    static let path = "snapshot/crews.json"

    let crews: [String: Crew]

    func crewName(_ crewId: String) -> String? {
        crews[crewId]?.name
    }

    func memberAvatarKey(crewId: String, userId: String) -> String? {
        crews[crewId]?.members?[userId]?.avatar
    }

    static func decode(_ data: Data) -> CrewDirectory? {
        try? SnapshotDecoder.decode(CrewDirectory.self, from: data, supportedSchemas: supportedSchemas)
    }

    static func read(containerUrl: URL?) -> CrewDirectory? {
        guard let containerUrl,
              let data = try? Data(contentsOf: containerUrl.appendingPathComponent(path))
        else { return nil }
        return decode(data)
    }
}
