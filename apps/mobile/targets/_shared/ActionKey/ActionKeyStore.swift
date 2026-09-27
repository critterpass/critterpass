import Foundation
import Security

/// The device action key the app issued and parked in the shared Keychain access group
/// (api-contracts-async.md §5). Field names match the JSON `src/data/push/action-key.ts` writes.
struct ActionKeyCredential: Codable, Equatable, Sendable {
    let keyId: String
    /// The secret exactly as issued (base64url text). Its UTF-8 bytes are the HMAC key, matching
    /// the server's verifier; it is never base64-decoded first.
    let secret: String
    let scopes: [String]
    let expiresAt: String
    let deviceId: String
    let userId: String

    enum CodingKeys: String, CodingKey {
        case keyId = "key_id"
        case secret
        case scopes
        case expiresAt = "expires_at"
        case deviceId = "device_id"
        case userId = "user_id"
    }

    func allows(_ scope: String) -> Bool { scopes.contains(scope) }
}

enum ActionKeyStoreError: Error, Equatable, Sendable {
    case notFound
    case unexpectedStatus(OSStatus)
    case malformedItem
}

/// Reads the key the app stored with `expo-secure-store` (`keychainService`
/// `app.critterpass.actions`, which that library suffixes with `:no-auth`; account
/// `device-action-key`, stored as UTF-8 data in both the account and generic attributes).
/// Extensions only read; the app issues, rotates and deletes.
enum ActionKeyStore {
    /// Must track `APPLE_TEAM_ID` in `apps/mobile/app.config.ts`.
    static let teamId = "YFND2EEW8S"
    static let accessGroup = "\(teamId).app.critterpass.shared"
    static let service = "app.critterpass.actions:no-auth"
    static let account = "device-action-key"

    static func read() throws -> ActionKeyCredential {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status != errSecItemNotFound else { throw ActionKeyStoreError.notFound }
        guard status == errSecSuccess else { throw ActionKeyStoreError.unexpectedStatus(status) }
        guard let data = result as? Data else { throw ActionKeyStoreError.malformedItem }
        return try decode(data)
    }

    /// Decodes the stored JSON; separate from `read()` so it is testable without a Keychain.
    static func decode(_ data: Data) throws -> ActionKeyCredential {
        do {
            return try JSONDecoder().decode(ActionKeyCredential.self, from: data)
        } catch {
            throw ActionKeyStoreError.malformedItem
        }
    }

    private static func baseQuery() -> [String: Any] {
        let encodedAccount = Data(account.utf8)
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccessGroup as String: accessGroup,
            kSecAttrService as String: service,
            kSecAttrAccount as String: encodedAccount,
            kSecAttrGeneric as String: encodedAccount,
        ]
    }
}
