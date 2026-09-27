import Foundation

/// Where a sender's avatar comes from, in the order the extension tries them: the App Group copy
/// the app cached (`assets/avatars/<key>@3x.png`), then a signed URL (at most 2 s), then the
/// bundled guide art, so a notification always shows a face.
enum AvatarSource: Equatable, Sendable {
    case appGroup(URL)
    case remote(URL)
    case guideDefault
}

struct AvatarLoader: Sendable {
    /// The bundled guide art (CritterArt.xcassets, copied into this target at prebuild).
    static let guideDefaultImageName = "gecko-common-idle-color-96pt"
    static let downloadTimeout: TimeInterval = 2
    static let maxAvatarBytes = 512 * 1024

    let containerUrl: URL?
    let fileExists: @Sendable (URL) -> Bool

    init(containerUrl: URL?, fileExists: @escaping @Sendable (URL) -> Bool = { url in
        FileManager.default.fileExists(atPath: url.path)
    }) {
        self.containerUrl = containerUrl
        self.fileExists = fileExists
    }

    /// `guide-tokek` → `assets/avatars/guide-tokek@3x.png`; `avatars/guide-tokek@3x.png` →
    /// `assets/avatars/guide-tokek@3x.png`. Anything that could leave the avatars folder is refused.
    static func appGroupRelativePath(forKey key: String) -> String? {
        var path = key
        if path.hasPrefix("assets/") { path.removeFirst("assets/".count) }
        if path.hasPrefix("avatars/") { path.removeFirst("avatars/".count) }
        guard !path.isEmpty, !path.contains(".."), !path.contains("/"), !path.contains("\\")
        else { return nil }
        if !path.hasSuffix(".png") { path += "@3x.png" }
        return "assets/avatars/\(path)"
    }

    /// Accepts only https URLs: a signed media URL, never a local or cleartext one.
    static func remoteUrl(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw), url.scheme?.lowercased() == "https",
              url.host?.isEmpty == false
        else { return nil }
        return url
    }

    /// The sources to try, in order. A key that is itself an https URL counts as a signed URL.
    func sources(avatarKey: String?, signedUrl: String?) -> [AvatarSource] {
        var result: [AvatarSource] = []
        if let avatarKey, Self.remoteUrl(avatarKey) == nil,
           let relative = Self.appGroupRelativePath(forKey: avatarKey),
           let containerUrl {
            let local = containerUrl.appendingPathComponent(relative)
            if fileExists(local) { result.append(.appGroup(local)) }
        }
        for candidate in [signedUrl, avatarKey] {
            if let remote = Self.remoteUrl(candidate), !result.contains(.remote(remote)) {
                result.append(.remote(remote))
            }
        }
        result.append(.guideDefault)
        return result
    }

    /// The first source that yields image bytes. `fetch` is the network boundary (a bounded
    /// URLSession download in the extension); `guideDefault` reads the bundled art.
    func load(
        avatarKey: String?,
        signedUrl: String?,
        fetch: @Sendable (URL) async -> Data?,
        guideDefault: () -> Data?
    ) async -> Data? {
        for source in sources(avatarKey: avatarKey, signedUrl: signedUrl) {
            switch source {
            case .appGroup(let url):
                if let data = try? Data(contentsOf: url), !data.isEmpty { return data }
            case .remote(let url):
                if let data = await fetch(url), !data.isEmpty, data.count <= Self.maxAvatarBytes {
                    return data
                }
            case .guideDefault:
                return guideDefault()
            }
        }
        return nil
    }

    /// Downloads an avatar within `downloadTimeout`; any failure is nil, never a thrown error.
    static func download(_ url: URL) async -> Data? {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = downloadTimeout
        configuration.timeoutIntervalForResource = downloadTimeout
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }
        guard let (data, response) = try? await session.data(from: url),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
        else { return nil }
        return data
    }
}
