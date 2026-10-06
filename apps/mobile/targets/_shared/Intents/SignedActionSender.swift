import Foundation

/// Sends a surface's command straight to `POST /v1/actions`, signed with the device action key, so
/// a Live Activity button, a control or a notification poster acts without the app running
/// (docs/api-contracts-async.md §4). When it cannot (offline, no key or endpoint on this phone yet,
/// the key refused, the server down) the same action goes into the shared outbox under the same
/// `op_id`, and the app sends it with its own session on its next launch; the server answers a
/// repeat as a duplicate, so nothing applies twice.
enum SignedActionSender {
    enum Result: Equatable, Sendable {
        /// The server's answer, success or a final refusal (`VOTE_CLOSED`, not a member).
        case answered(statusCode: Int, body: Data)
        case queued
        /// Neither sent nor queued (no App Group container).
        case failed
    }

    static func send(
        _ action: PendingAction, surface: ActionSurface, root: URL?, now: Date = Date()
    ) async -> Result {
        if let request = request(action, surface: surface, root: root, now: now),
           let reply = try? await URLSession.shared.data(for: request),
           let http = reply.1 as? HTTPURLResponse, isFinal(http.statusCode) {
            return .answered(statusCode: http.statusCode, body: reply.0)
        }
        do {
            try PendingActionsOutbox.append(action, root: root, now: now)
            return .queued
        } catch {
            return .failed
        }
    }

    /// Success, or a refusal about the command itself. A key or session the server will not take
    /// (401, 403) and server trouble (5xx) leave the action for the app's own session.
    static func isFinal(_ statusCode: Int) -> Bool {
        (200..<300).contains(statusCode)
            || ((400..<500).contains(statusCode) && statusCode != 401 && statusCode != 403)
    }

    /// The signed request, or nil without a key, an endpoint or a text-only payload.
    static func request(
        _ action: PendingAction, surface: ActionSurface, root: URL?, now: Date
    ) -> URLRequest? {
        guard let payload = textPayload(action),
              let apiBaseUrl = ActionEndpoints.apiBaseUrl(root: root),
              let credential = try? ActionKeyStore.read()
        else { return nil }
        return try? SignedRequest.actionRequest(
            command: action.cmd, scope: action.scope, payload: payload, credential: credential,
            surface: surface, apiBaseUrl: apiBaseUrl, opId: action.opId, now: now)
    }

    /// The payload as text values, which is what a signed request carries; nil when a value is a
    /// number, flag or object (such an action goes through the outbox).
    static func textPayload(_ action: PendingAction) -> [String: String]? {
        var payload: [String: String] = [:]
        for (key, value) in action.payload {
            guard case .text(let text) = value else { return nil }
            payload[key] = text
        }
        return payload
    }
}

/// `config/endpoints.json` (docs/api-contracts-async.md §6), written by the app at start.
enum ActionEndpoints {
    static let relativePath = "config/endpoints.json"

    private struct File: Decodable {
        let schema: Int
        let apiBaseUrl: String

        enum CodingKeys: String, CodingKey {
            case schema
            case apiBaseUrl = "api_base_url"
        }
    }

    static func apiBaseUrl(root: URL?) -> URL? {
        guard let root,
              let data = try? Data(contentsOf: root.appendingPathComponent(relativePath)),
              let file = try? JSONDecoder().decode(File.self, from: data), file.schema == 1
        else { return nil }
        return URL(string: file.apiBaseUrl)
    }
}
