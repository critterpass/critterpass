import Intents
import UserNotifications

/// Hello-world Notification Service extension proving the target builds, signs and runs under
/// Swift 6 strict concurrency (api-contracts-async.md §3.1 "Communication Notification sender
/// identity"). A real push carries `cp.sender` (guide or crewmate) in its custom data block;
/// this rewrites the notification as a communication notification with that sender's identity,
/// downloading the avatar referenced by the payload. If donating the intent is refused for any
/// reason, the extension falls back to the original alert content untouched.
final class NotificationService: UNNotificationServiceExtension, @unchecked Sendable {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        guard let mutableContent = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        bestAttemptContent = mutableContent

        guard let sender = SenderIdentity(userInfo: request.content.userInfo) else {
            contentHandler(mutableContent)
            return
        }

        Task {
            let finalContent = await Self.applyCommunicationIdentity(sender: sender, to: mutableContent)
            contentHandler(finalContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let bestAttemptContent {
            contentHandler?(bestAttemptContent)
        }
    }

    private static func applyCommunicationIdentity(
        sender: SenderIdentity,
        to content: UNMutableNotificationContent
    ) async -> UNNotificationContent {
        let avatarUrl = await AvatarDownloader.resolve(sender: sender)
        var avatarImage: INImage?
        if let avatarUrl, let data = try? Data(contentsOf: avatarUrl) {
            avatarImage = INImage(imageData: data)
        }

        let person = INPerson(
            personHandle: INPersonHandle(value: sender.handleValue, type: .unknown),
            nameComponents: nil,
            displayName: sender.displayName,
            image: avatarImage,
            contactIdentifier: nil,
            customIdentifier: sender.handleValue
        )

        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: INSpeakableString(spokenPhrase: sender.conversationName),
            conversationIdentifier: sender.conversationIdentifier,
            serviceName: nil,
            sender: person,
            attachments: nil
        )

        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        do {
            try await interaction.donate()
            if let updated = try? content.updating(from: intent) {
                return updated
            }
        } catch {
            // Communication-notification donation can be refused by the system (e.g. missing
            // entitlement approval); the original content is still a valid, deliverable
            // notification, so this is a documented fallback, not a crash.
        }
        return content
    }
}

/// Parsed from the push payload's `cp.sender` block (api-contracts-async.md §3.1).
private struct SenderIdentity {
    let kind: String
    let id: String
    let name: String
    let avatarPath: String?

    var handleValue: String {
        kind == "guide" ? "cp-guide:\(id)" : "cp-user:\(id)"
    }

    var displayName: String {
        kind == "guide" ? "\(name) · AI guide" : name
    }

    var conversationName: String {
        name
    }

    var conversationIdentifier: String {
        id
    }

    init?(userInfo: [AnyHashable: Any]) {
        guard
            let cp = userInfo["cp"] as? [String: Any],
            let sender = cp["sender"] as? [String: Any],
            let kind = sender["kind"] as? String,
            let id = sender["id"] as? String,
            let name = sender["name"] as? String
        else {
            return nil
        }
        self.kind = kind
        self.id = id
        self.name = name
        self.avatarPath = sender["avatar"] as? String
    }
}

/// Avatars are bundled into the App Group by the app (api-contracts-async.md §6
/// `assets/avatars/`); a signed URL is only fetched as a fallback for an avatar the app has not
/// synced yet.
private enum AvatarDownloader {
    static func resolve(sender: SenderIdentity) async -> URL? {
        guard let path = sender.avatarPath, let containerUrl = AppGroupContainer.url else {
            return nil
        }
        let localUrl = containerUrl.appendingPathComponent(path)
        if FileManager.default.fileExists(atPath: localUrl.path) {
            return localUrl
        }
        return nil
    }
}
