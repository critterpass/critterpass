import Foundation
import Security

/// A device action key minted by `POST /v1/devices/{id}/action-keys` (api-contracts-async.md
/// §5). The secret never touches an App Group file — it lives only in the shared Keychain
/// access group, readable by the app and every extension that needs to call `/v1/actions`.
struct DeviceActionKey: Sendable {
    let keyId: String
    let secret: Data
    let scopes: [String]
}

enum KeychainActionKeyStoreError: Error, Sendable {
    case notFound
    case unexpectedStatus(OSStatus)
    case malformedItem
}

/// Reads/writes the device action key from the shared Keychain access group
/// (`<TeamID>.app.critterpass.shared`). The team ID prefix must match `appleTeamId` in
/// `apps/mobile/app.config.ts`; Xcode only expands `$(AppIdentifierPrefix)` inside `.entitlements`
/// files, so runtime code needs the resolved literal.
enum KeychainActionKeyStore {
    /// Must track `APPLE_TEAM_ID` in `apps/mobile/app.config.ts`.
    static let teamId = "YFND2EEW8S"
    static let accessGroup = "\(teamId).app.critterpass.shared"
    private static let account = "device-action-key"
    private static let service = "app.critterpass.actions"

    static func read() throws -> DeviceActionKey {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecReturnAttributes as String] = true

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status != errSecItemNotFound else { throw KeychainActionKeyStoreError.notFound }
        guard status == errSecSuccess else { throw KeychainActionKeyStoreError.unexpectedStatus(status) }
        guard
            let item = result as? [String: Any],
            let secret = item[kSecValueData as String] as? Data,
            let keyId = item[kSecAttrLabel as String] as? String
        else {
            throw KeychainActionKeyStoreError.malformedItem
        }
        let scopesCsv = item[kSecAttrComment as String] as? String ?? ""
        let scopes = scopesCsv.split(separator: ",").map(String.init)
        return DeviceActionKey(keyId: keyId, secret: secret, scopes: scopes)
    }

    static func write(_ key: DeviceActionKey) throws {
        var attributes = baseQuery()
        attributes[kSecValueData as String] = key.secret
        attributes[kSecAttrLabel as String] = key.keyId
        attributes[kSecAttrComment as String] = key.scopes.joined(separator: ",")

        let deleteQuery = baseQuery()
        SecItemDelete(deleteQuery as CFDictionary)

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainActionKeyStoreError.unexpectedStatus(status) }
    }

    private static func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccessGroup as String: accessGroup,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
