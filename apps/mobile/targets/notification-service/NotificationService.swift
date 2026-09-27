import Intents
import UIKit
import UserNotifications

/// Rewrites every crew and guide push as a Communication Notification (docs/api-contracts-async.md
/// §3.1): the sender's name and face lead the banner, grouped by crew. Minimal-payload pushes
/// (`cp.full: false`) first fetch their content with the device action key. Every step degrades to
/// the content the push arrived with: a failed fetch keeps the generic line, a refused intent falls
/// back to an avatar attachment, and running out of time delivers the best attempt so far.
final class NotificationService: UNNotificationServiceExtension, @unchecked Sendable {
    private let delivery = Delivery()

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        delivery.start(handler: contentHandler, bestAttempt: content)
        guard let payload = CPPayload(userInfo: request.content.userInfo) else {
            delivery.finish(content)
            return
        }
        let delivery = self.delivery
        Task {
            let final = await Self.render(payload: payload, content: content)
            delivery.finish(final)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        delivery.expire()
    }

    private static func render(
        payload: CPPayload,
        content: UNMutableNotificationContent
    ) async -> UNNotificationContent {
        let containerUrl = AppGroupContainer.url
        let credential = try? ActionKeyStore.read()
        var sender = payload.sender
        var crewId = payload.crewId

        if !payload.full, let fetched = await MinimalPayload.fetch(
            notificationId: payload.notificationId, credential: credential, containerUrl: containerUrl
        ) {
            content.title = fetched.title
            content.body = fetched.body
            if let threadId = fetched.threadId { content.threadIdentifier = threadId }
            sender = fetched.sender ?? sender
            crewId = fetched.crewId ?? crewId
        }
        if content.threadIdentifier.isEmpty, let crewId { content.threadIdentifier = crewId }

        let crews = CrewDirectory.read(containerUrl: containerUrl)
        guard let identity = SenderIdentity(
            sender: sender, crewId: crewId, recipientUserId: credential?.userId, crews: crews
        ) else { return content }

        let avatar = await AvatarLoader(containerUrl: containerUrl).load(
            avatarKey: identity.avatarKey(crews: crews, crewId: crewId),
            signedUrl: sender.avatarUrl,
            fetch: { url in await AvatarLoader.download(url) },
            guideDefault: { UIImage(named: AvatarLoader.guideDefaultImageName)?.pngData() }
        )
        return await CommunicationContent.apply(identity: identity, avatar: avatar, to: content)
    }
}

/// Calls the system's content handler exactly once, whichever of "rendered", "no `cp` block" or
/// "time is up" happens first.
private final class Delivery: @unchecked Sendable {
    private let lock = NSLock()
    private var handler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNNotificationContent?

    func start(handler: @escaping (UNNotificationContent) -> Void, bestAttempt: UNNotificationContent) {
        lock.withLock {
            self.handler = handler
            self.bestAttempt = bestAttempt
        }
    }

    func finish(_ content: UNNotificationContent) {
        let handler = lock.withLock { () -> ((UNNotificationContent) -> Void)? in
            defer { self.handler = nil }
            return self.handler
        }
        handler?(content)
    }

    func expire() {
        let best = lock.withLock { bestAttempt }
        if let best { finish(best) }
    }
}

/// `GET /v1/notifications/{nid}` signed with the device action key (`read_notification` scope).
private enum MinimalPayload {
    static func fetch(
        notificationId: String,
        credential: ActionKeyCredential?,
        containerUrl: URL?
    ) async -> CPNotificationContent? {
        guard let credential,
              let apiBaseUrl = AppGroupEndpoints.apiBaseUrl(containerUrl: containerUrl),
              let request = try? SignedRequest.notificationRequest(
                  notificationId: notificationId, credential: credential, apiBaseUrl: apiBaseUrl
              ),
              let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200
        else { return nil }
        return CPNotificationContent.decode(data)
    }
}

private enum CommunicationContent {
    static func apply(
        identity: SenderIdentity,
        avatar: Data?,
        to content: UNMutableNotificationContent
    ) async -> UNNotificationContent {
        let person = INPerson(
            personHandle: INPersonHandle(value: identity.handle, type: .unknown),
            nameComponents: nil,
            displayName: identity.displayName,
            image: avatar.map { INImage(imageData: $0) },
            contactIdentifier: nil,
            customIdentifier: identity.handle
        )
        let intent = INSendMessageIntent(
            recipients: nil,
            outgoingMessageType: .outgoingMessageText,
            content: content.body,
            speakableGroupName: identity.groupName.map { INSpeakableString(spokenPhrase: $0) },
            conversationIdentifier: identity.conversationIdentifier,
            serviceName: nil,
            sender: person,
            attachments: nil
        )
        if let avatar {
            intent.setImage(INImage(imageData: avatar), forParameterNamed: \.sender)
        }
        let interaction = INInteraction(intent: intent, response: nil)
        interaction.direction = .incoming
        // A refused donation still lets `updating(from:)` try; only its failure means fallback.
        try? await interaction.donate()
        do {
            return try content.updating(from: intent)
        } catch {
            return withAvatarAttachment(content, identity: identity, avatar: avatar)
        }
    }

    /// Fallback when the system refuses the communication intent: a plain alert that still names
    /// the sender and carries their face as an image attachment.
    static func withAvatarAttachment(
        _ content: UNMutableNotificationContent,
        identity: SenderIdentity,
        avatar: Data?
    ) -> UNNotificationContent {
        if content.subtitle.isEmpty, identity.displayName != content.title {
            content.subtitle = identity.displayName
        }
        guard let avatar else { return content }
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("cp-avatar-\(UUID().uuidString).png")
        guard (try? avatar.write(to: file)) != nil,
              let attachment = try? UNNotificationAttachment(identifier: "sender-avatar", url: file)
        else { return content }
        content.attachments = [attachment]
        return content
    }
}
