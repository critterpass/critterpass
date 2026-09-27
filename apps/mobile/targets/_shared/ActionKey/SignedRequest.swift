import CryptoKit
import Foundation

/// `POST /v1/actions` signing (api-contracts-async.md §5): headers `X-CP-Key-Id`, `X-CP-Ts`
/// (unix seconds, ±300 s) and `X-CP-Sig = base64url(HMAC-SHA256(secret, method \n path \n ts \n
/// hex(sha256(body))))`. The body is a full command envelope; the server runs it through the same
/// pipeline as the app, so a retried request with the same `op_id` is answered as a duplicate.
struct SignedRequestHeaders: Equatable, Sendable {
    let keyId: String
    let timestamp: String
    let signature: String
}

enum SignedRequestError: Error, Sendable {
    case scopeNotGranted(String)
    case encodingFailed
}

/// The surfaces allowed through `/v1/actions` (`actor.via`).
enum ActionSurface: String, Sendable {
    case widget
    case notificationAction = "notif_action"
    case liveActivityIntent = "la_intent"
    case appIntent = "app_intent"
}

enum SignedRequest {
    /// Pure: no I/O, so the signature is checked against the vector the server test pins.
    static func sign(
        method: String,
        path: String,
        body: Data,
        keyId: String,
        secret: String,
        timestamp: Date
    ) -> SignedRequestHeaders {
        let ts = String(Int(timestamp.timeIntervalSince1970))
        let bodyDigest = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
        let message = "\(method)\n\(path)\n\(ts)\n\(bodyDigest)"
        let mac = HMAC<SHA256>.authenticationCode(
            for: Data(message.utf8),
            using: SymmetricKey(data: Data(secret.utf8))
        )
        return SignedRequestHeaders(keyId: keyId, timestamp: ts, signature: base64url(Data(mac)))
    }

    static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// A time-ordered UUIDv7 (RFC 9562): the server only accepts v7 `op_id`s.
    static func uuidV7(now: Date = Date()) -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        let millis = UInt64(now.timeIntervalSince1970 * 1000)
        for index in 0..<6 {
            bytes[index] = UInt8(truncatingIfNeeded: millis >> (8 * (5 - index)))
        }
        for index in 6..<16 {
            bytes[index] = UInt8.random(in: 0...255)
        }
        bytes[6] = (bytes[6] & 0x0F) | 0x70
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let parts = [hex.prefix(8), hex.dropFirst(8).prefix(4), hex.dropFirst(12).prefix(4),
                     hex.dropFirst(16).prefix(4), hex.dropFirst(20)]
        return parts.map(String.init).joined(separator: "-")
    }

    /// The command envelope (api-contracts.md §2.1) for one action, keyed by a fresh `op_id`
    /// unless the caller is retrying a queued one.
    static func envelope(
        command: String,
        payload: [String: String],
        credential: ActionKeyCredential,
        surface: ActionSurface,
        opId: String = uuidV7(),
        now: Date = Date()
    ) throws -> Data {
        let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let body: [String: Any] = [
            "op_id": opId,
            "cmd": command,
            "v": 1,
            "actor": ["uid": credential.userId, "via": surface.rawValue],
            "device": [
                "id": credential.deviceId,
                "platform": "ios",
                "app_version": (appVersion as? String) ?? "0.0.0",
                "tz": TimeZone.current.identifier,
            ],
            "client_ts": formatter.string(from: now),
            "payload": payload,
        ]
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        else { throw SignedRequestError.encodingFailed }
        return data
    }

    /// A signed `URLRequest` for `/v1/actions`; refuses locally when the key lacks `scope`.
    static func actionRequest(
        command: String,
        scope: String,
        payload: [String: String],
        credential: ActionKeyCredential,
        surface: ActionSurface,
        apiBaseUrl: URL,
        opId: String = uuidV7(),
        now: Date = Date()
    ) throws -> URLRequest {
        guard credential.allows(scope) else { throw SignedRequestError.scopeNotGranted(scope) }
        let path = "/v1/actions"
        let body = try envelope(
            command: command, payload: payload, credential: credential, surface: surface,
            opId: opId, now: now
        )
        let headers = sign(
            method: "POST", path: path, body: body, keyId: credential.keyId,
            secret: credential.secret, timestamp: now
        )
        var request = URLRequest(url: apiBaseUrl.appendingPathComponent("v1/actions"))
        request.httpMethod = "POST"
        request.httpBody = body
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(headers.keyId, forHTTPHeaderField: "X-CP-Key-Id")
        request.setValue(headers.timestamp, forHTTPHeaderField: "X-CP-Ts")
        request.setValue(headers.signature, forHTTPHeaderField: "X-CP-Sig")
        return request
    }

    /// A signed `GET /v1/notifications/{id}` (scope `read_notification`) for minimal-payload pushes.
    static func notificationRequest(
        notificationId: String,
        credential: ActionKeyCredential,
        apiBaseUrl: URL,
        now: Date = Date()
    ) throws -> URLRequest {
        guard credential.allows("read_notification") else {
            throw SignedRequestError.scopeNotGranted("read_notification")
        }
        let path = "/v1/notifications/\(notificationId)"
        let headers = sign(
            method: "GET", path: path, body: Data(), keyId: credential.keyId,
            secret: credential.secret, timestamp: now
        )
        var request = URLRequest(url: apiBaseUrl.appendingPathComponent(String(path.dropFirst())))
        request.httpMethod = "GET"
        request.timeoutInterval = 8
        request.setValue(headers.keyId, forHTTPHeaderField: "X-CP-Key-Id")
        request.setValue(headers.timestamp, forHTTPHeaderField: "X-CP-Ts")
        request.setValue(headers.signature, forHTTPHeaderField: "X-CP-Sig")
        return request
    }
}
