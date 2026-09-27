import Foundation

/// Every JSON file the app writes into the App Group container starts with this envelope
/// (api-contracts-async.md §6): `{"schema": <int>, "generated_at": ISO, ...}`. Readers decode
/// the envelope first, compare `schema` against the version they were built for, and only then
/// decode the concrete payload — so an extension built against an older snapshot shape never
/// crashes on an app that has already moved to a newer one.
struct SnapshotEnvelope: Codable, Hashable, Sendable {
    let schema: Int
    let generatedAt: Date

    enum CodingKeys: String, CodingKey {
        case schema
        case generatedAt = "generated_at"
    }
}

enum SnapshotSchemaError: Error, Sendable {
    case unsupportedSchema(found: Int, supported: ClosedRange<Int>)
}

/// Decodes a schema-versioned JSON payload written by the app into the App Group container.
/// `supportedSchemas` names every schema version this extension build understands; a mismatch
/// throws instead of attempting to decode a shape the extension was not compiled against.
enum SnapshotDecoder {
    static func decode<Payload: Decodable>(
        _ type: Payload.Type,
        from data: Data,
        supportedSchemas: ClosedRange<Int>,
        decoder: JSONDecoder = .cpSnapshotDecoder
    ) throws -> Payload {
        let envelope = try decoder.decode(SnapshotEnvelope.self, from: data)
        guard supportedSchemas.contains(envelope.schema) else {
            throw SnapshotSchemaError.unsupportedSchema(found: envelope.schema, supported: supportedSchemas)
        }
        return try decoder.decode(Payload.self, from: data)
    }
}

extension JSONDecoder {
    static var cpSnapshotDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

extension JSONEncoder {
    static var cpSnapshotEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

/// Read-only access to the shared App Group container every target in this scaffold uses.
/// The identifier matches `apps/mobile/app.config.ts`'s app group entitlement.
enum AppGroupContainer {
    static let identifier = "group.app.critterpass"

    static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }
}
