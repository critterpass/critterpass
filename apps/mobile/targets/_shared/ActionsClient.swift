import CryptoKit
import Foundation

/// Signs and (optionally) sends a `POST /v1/actions` request using a device action key
/// (api-contracts-async.md §5): headers `X-CP-Key-Id`, `X-CP-Ts` (±300 s window), and
/// `X-CP-Sig = base64url(HMAC-SHA256(secret, method \n path \n ts \n sha256(body)))`.
enum ActionsClientError: Error, Sendable {
    case encodingFailed
}

struct SignedRequestHeaders: Equatable, Sendable {
    let keyId: String
    let timestamp: String
    let signature: String
}

enum ActionsClient {
    /// Pure signing function — no I/O — so the signature construction can be unit tested without
    /// a Keychain item or a network connection.
    static func sign(
        method: String,
        path: String,
        body: Data,
        key: DeviceActionKey,
        timestamp: Date = Date()
    ) -> SignedRequestHeaders {
        let ts = String(Int(timestamp.timeIntervalSince1970))
        let bodyDigest = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
        let toSign = "\(method)\n\(path)\n\(ts)\n\(bodyDigest)"
        let signature = HMAC<SHA256>.authenticationCode(
            for: Data(toSign.utf8),
            using: SymmetricKey(data: key.secret)
        )
        let base64url = Data(signature)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return SignedRequestHeaders(keyId: key.keyId, timestamp: ts, signature: base64url)
    }

    /// Builds a fully-signed `URLRequest` against the endpoint recorded in the App Group's
    /// `config/endpoints.json` (api-contracts-async.md §6). Callers own error handling for the
    /// actual network call — extensions must never block their host lifecycle on it.
    static func buildRequest(
        path: String,
        command: String,
        scope: String,
        payload: [String: String],
        key: DeviceActionKey,
        apiBaseUrl: URL
    ) throws -> URLRequest {
        let envelope = ActionEnvelope(opId: UUID().uuidString, command: command, scope: scope, payload: payload)
        guard let body = try? JSONEncoder.cpSnapshotEncoder.encode(envelope) else {
            throw ActionsClientError.encodingFailed
        }
        let headers = sign(method: "POST", path: path, body: body, key: key)

        var request = URLRequest(url: apiBaseUrl.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(headers.keyId, forHTTPHeaderField: "X-CP-Key-Id")
        request.setValue(headers.timestamp, forHTTPHeaderField: "X-CP-Ts")
        request.setValue(headers.signature, forHTTPHeaderField: "X-CP-Sig")
        return request
    }
}

private struct ActionEnvelope: Codable, Sendable {
    let opId: String
    let command: String
    let scope: String
    let payload: [String: String]

    enum CodingKeys: String, CodingKey {
        case opId = "op_id"
        case command
        case scope
        case payload
    }
}
