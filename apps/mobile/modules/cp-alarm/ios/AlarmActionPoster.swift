import CryptoKit
import Foundation
import Security

#if canImport(CpAppGroupStore)
  import CpAppGroupStore
#else
  import CpAppGroup
#endif

/// The device action key the app parks in the shared Keychain access group (field names match
/// apps/mobile/src/data/push/action-key.ts and targets/_shared/ActionKey/ActionKeyStore.swift).
public struct AlarmActionKey: Codable, Equatable, Sendable {
  public let keyId: String
  public let secret: String
  public let scopes: [String]
  public let deviceId: String
  public let userId: String

  enum CodingKeys: String, CodingKey {
    case keyId = "key_id"
    case secret
    case scopes
    case deviceId = "device_id"
    case userId = "user_id"
  }
}

/// Sends a queued alarm command straight to `POST /v1/actions` with the device action key
/// (docs/api-contracts-async.md §5) when the phone is online. The command is already in the
/// outbox under the same `op_id`, so a send that fails, or one the app repeats from its drain, is
/// applied once.
public enum AlarmActionPoster {
  static let path = "/v1/actions"

  /// The signed request for one queued action; nil when the key lacks the action's scope.
  public static func request(
    for action: PendingAction, key: AlarmActionKey, apiBaseUrl: URL, now: Date = Date()
  ) throws -> URLRequest? {
    guard key.scopes.contains(action.scope.rawValue) else { return nil }
    let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
    let envelope: [String: Any] = [
      "op_id": action.opId,
      "cmd": action.cmd,
      "v": action.v,
      "actor": ["uid": key.userId, "via": action.via.rawValue],
      "device": [
        "id": key.deviceId, "platform": "ios", "app_version": (appVersion as? String) ?? "0.0.0",
        "tz": TimeZone.current.identifier,
      ],
      "client_ts": action.clientTs,
      "payload": try JSONSerialization.jsonObject(with: JSONEncoder().encode(action.payload)),
    ]
    let body = try JSONSerialization.data(withJSONObject: envelope, options: [.sortedKeys])
    let ts = String(Int(now.timeIntervalSince1970))
    let digest = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
    let mac = HMAC<SHA256>.authenticationCode(
      for: Data("POST\n\(path)\n\(ts)\n\(digest)".utf8),
      using: SymmetricKey(data: Data(key.secret.utf8)))
    let signature = Data(mac).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")

    var request = URLRequest(url: apiBaseUrl.appendingPathComponent("v1/actions"))
    request.httpMethod = "POST"
    request.httpBody = body
    request.timeoutInterval = 10
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(key.keyId, forHTTPHeaderField: "X-CP-Key-Id")
    request.setValue(ts, forHTTPHeaderField: "X-CP-Ts")
    request.setValue(signature, forHTTPHeaderField: "X-CP-Sig")
    return request
  }

  /// Best effort: true when the api answered 2xx. Every failure leaves the outbox entry for the
  /// app's drain.
  public static func send(_ action: PendingAction, store: AppGroupStore) async -> Bool {
    guard let key = readKey(), let apiBaseUrl = apiBaseUrl(store: store),
      let request = try? request(for: action, key: key, apiBaseUrl: apiBaseUrl),
      let (_, response) = try? await URLSession.shared.data(for: request),
      let status = (response as? HTTPURLResponse)?.statusCode
    else { return false }
    return (200..<300).contains(status)
  }

  /// `config/endpoints.json`'s `api_base_url`, https only.
  public static func apiBaseUrl(store: AppGroupStore) -> URL? {
    guard let data = try? store.read(AppGroupStore.endpointsPath),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let text = object["api_base_url"] as? String, let url = URL(string: text),
      url.scheme == "https"
    else { return nil }
    return url
  }

  // `expo-secure-store` suffixes the service with `:no-auth` and stores the account as data.
  private static let accessGroup = "YFND2EEW8S.app.critterpass.shared"
  private static let service = "app.critterpass.actions:no-auth"
  private static let account = Data("device-action-key".utf8)

  private static func readKey() -> AlarmActionKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccessGroup as String: accessGroup,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrGeneric as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return try? JSONDecoder().decode(AlarmActionKey.self, from: data)
  }
}
