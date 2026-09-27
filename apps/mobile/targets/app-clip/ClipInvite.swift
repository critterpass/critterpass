import Foundation

/// A link the App Clip can show a ticket for: a crew invite (`/i/<code>[/<seat>]`, `/j/<code>`)
/// or a referral (`/r/<code>`), on one of CritterPass's link hosts (packages/domain/src/links
/// grammar.ts and hosts.ts). Every other link opens the clip's generic card.
struct ClipLink: Equatable, Sendable {
    enum Kind: String, Sendable {
        case invite
        case referral
    }

    static let joinCodeAlphabet = Set("23456789ABCDEFGHJKMNPQRSTVWXYZ")
    static let joinCodeLength = 6
    static let channels: Set<String> = ["wa", "imsg", "sms", "ig", "tg", "mail", "qr", "copy", "x"]

    /// Link host → the api that previews its links (apps/web/src/lib/links/web-env.ts).
    static let apiBaseUrls: [String: String] = [
        "critterpass.app": "https://api.critterpass.app",
        "go.critterpass.app": "https://api.critterpass.app",
        "staging.critterpass.app": "https://api-staging-de92.up.railway.app",
        "go.staging.critterpass.app": "https://api-staging-de92.up.railway.app",
    ]

    let kind: Kind
    let code: String
    let seat: String?
    let channel: String?
    /// The https link the clip was opened with, handed to the full app unchanged.
    let url: URL
    let apiBaseUrl: URL

    init?(url: URL) {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased(),
              let api = Self.apiBaseUrls[host].flatMap(URL.init(string:))
        else { return nil }
        let segments = url.path.split(separator: "/").map(String.init)
        guard let prefix = segments.first else { return nil }
        let rest = Array(segments.dropFirst())
        switch prefix {
        case "i", "j":
            guard (1...2).contains(rest.count), let code = Self.normalizeJoinCode(rest[0]) else {
                return nil
            }
            let seat = rest.count == 2 ? rest[1] : nil
            if let seat, !Self.isSeatTokenShape(seat) { return nil }
            self.kind = .invite
            self.code = code
            self.seat = seat
        case "r":
            guard rest.count == 1, let code = Self.normalizeJoinCode(rest[0]) else { return nil }
            self.kind = .referral
            self.code = code
            self.seat = nil
        default:
            return nil
        }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        let channel = query?.first(where: { $0.name == "c" })?.value
        self.channel = channel.flatMap { Self.channels.contains($0) ? $0 : nil }
        self.url = url
        self.apiBaseUrl = api
    }

    /// `GET /v1/links/{code}/preview?kind=…[&seat=…][&c=…]` (docs/api-contracts.md §5.6).
    var previewUrl: URL {
        var components = URLComponents(
            url: apiBaseUrl.appendingPathComponent("v1/links/\(code)/preview"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "kind", value: kind.rawValue)]
        if let seat { items.append(URLQueryItem(name: "seat", value: seat)) }
        if let channel { items.append(URLQueryItem(name: "c", value: channel)) }
        components.queryItems = items
        return components.url!
    }

    static func normalizeJoinCode(_ raw: String) -> String? {
        let compact = raw.uppercased().filter { $0 != "-" && !$0.isWhitespace }
        guard compact.count == joinCodeLength, compact.allSatisfy(joinCodeAlphabet.contains) else {
            return nil
        }
        return compact
    }

    /// 44 base64url characters (nonce + MAC) then a 1–8 character key id.
    static func isSeatTokenShape(_ token: String) -> Bool {
        guard (45...52).contains(token.count) else { return false }
        let head = token.prefix(44)
        let keyId = token.dropFirst(44)
        let base64url = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        let keyChars = Set("abcdefghijklmnopqrstuvwxyz0123456789")
        return head.allSatisfy(base64url.contains) && keyId.allSatisfy(keyChars.contains)
    }
}

/// The public-safe preview (packages/domain/src/links/wire.ts `linkPreviewSchema`).
struct ClipPreview: Decodable, Equatable, Sendable {
    enum State: String, Decodable, Sendable {
        case active, expired, revoked, full
    }

    let kind: String
    let crewName: String?
    let inviterFirstName: String?
    let tripPlace: String?
    let membersCount: Int?
    let expiresAt: String?
    let state: State

    enum CodingKeys: String, CodingKey {
        case kind, state
        case crewName = "crew_name"
        case inviterFirstName = "inviter_first_name"
        case tripPlace = "trip_place"
        case membersCount = "members_count"
        case expiresAt = "expires_at"
    }

    static func decode(_ data: Data) -> ClipPreview? {
        try? JSONDecoder().decode(ClipPreview.self, from: data)
    }
}

/// What the ticket shows, in words: every field falls back so a missing preview still reads well.
struct TicketContent: Equatable, Sendable {
    let headline: String
    let crewName: String
    let destination: String
    let seatsLine: String?
    let code: String
    let isOpen: Bool

    init(link: ClipLink, preview: ClipPreview?) {
        let inviter = preview?.inviterFirstName
        let place = preview?.tripPlace
        switch link.kind {
        case .invite:
            if let inviter {
                headline = String(
                    format: NSLocalizedString(
                        "clip.headline.invite.from", value: "%@ saved you a seat",
                        comment: "Inviter first name"),
                    inviter)
            } else {
                headline = NSLocalizedString(
                    "clip.headline.invite", value: "You’re invited", comment: "Invite ticket headline")
            }
        case .referral:
            headline = NSLocalizedString(
                "clip.headline.referral", value: "Your pass is waiting",
                comment: "Referral ticket headline")
        }
        crewName = preview?.crewName ?? NSLocalizedString(
            "clip.crew.fallback", value: "Crew ticket", comment: "Ticket title without a crew name")
        destination = place.map { $0.uppercased() } ?? "CRITTERPASS"
        if let count = preview?.membersCount, count > 0 {
            seatsLine = String(
                format: NSLocalizedString(
                    "clip.seats.in", value: "%d already in", comment: "Crew members already joined"),
                count)
        } else {
            seatsLine = nil
        }
        code = link.code
        isOpen = preview.map { $0.state == .active } ?? true
    }
}

/// Leaves the opened link in the shared App Group (`state/clip-link.json`) so the full app,
/// installed from the clip, lands on the same invite at first launch (read by
/// modules/cp-deferred-link `consumeClipLink`).
enum ClipLinkHandoff {
    static let path = "state/clip-link.json"

    static func fileData(url: URL, now: Date) -> Data? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let body: [String: Any] = [
            "schema": 1,
            "generated_at": formatter.string(from: now),
            "url": url.absoluteString,
        ]
        return try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    }

    /// Atomic write (temp file + rename, as every App Group file is written).
    @discardableResult
    static func write(url: URL, containerUrl: URL?, now: Date = Date()) -> Bool {
        guard let containerUrl, let data = fileData(url: url, now: now) else { return false }
        let fileUrl = containerUrl.appendingPathComponent(path)
        do {
            try FileManager.default.createDirectory(
                at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: fileUrl, options: [.atomic])
            return true
        } catch {
            return false
        }
    }
}
