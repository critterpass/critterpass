import Foundation

/// One command an extension or a `LiveActivityIntent` queues for the app, in exactly the entry
/// shape the app's drain accepts (`pendingActionSchema` in packages/domain/src/surfaces/app-group.ts,
/// api-contracts-async.md §4, §6): `{op_id (UUIDv7), cmd, v, via, scope, client_ts, payload}`.
/// The app adds the signed-in uid and the device, keeping this `op_id` and `via`, so a command the
/// server already applied comes back as a duplicate instead of applying twice.
struct PendingAction: Hashable, Sendable {
    /// How the surface reached the command (the envelope's `actor.via`).
    enum Via: String, Sendable {
        case widget
        case notifAction = "notif_action"
        case laIntent = "la_intent"
        case appIntent = "app_intent"
    }

    static let version = 1

    let opId: String
    let cmd: String
    let via: Via
    /// The action-key scope the surface would have used for `POST /v1/actions`.
    let scope: String
    /// When the user acted.
    let clientTs: Date
    let payload: [String: PendingActionValue]

    /// The JSON object written into the file's `actions` array.
    var entry: [String: Any] {
        [
            "op_id": opId,
            "cmd": cmd,
            "v": Self.version,
            "via": via.rawValue,
            "scope": scope,
            "client_ts": PendingActionsOutbox.timestamp(clientTs),
            "payload": payload.mapValues(\.json),
        ]
    }

    /// "I'M UP" on the leave-by Live Activity: `set_readiness{leave_by_id, state: up, source: la}`.
    static func imUp(
        leaveById: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId,
            cmd: "set_readiness",
            via: .laIntent,
            scope: "readiness",
            clientTs: now,
            payload: ["leave_by_id": .text(leaveById), "state": "up", "source": "la"]
        )
    }

    /// SNOOZE on the leave-by Live Activity: `snooze_leave_by{leave_by_id}`. The server counts the
    /// snoozes (the second one knocks on the crew), so the phone sends no count of its own.
    static func snooze(
        leaveById: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "snooze_leave_by", via: .laIntent, scope: "readiness", clientTs: now,
            payload: ["leave_by_id": .text(leaveById)]
        )
    }

    /// RUNNING LATE on the crew-live activity: `report_running_late{trip_id, meetup_id, minutes}`.
    static func runningLate(
        tripId: String, meetupId: String, minutes: Int = 10,
        opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "report_running_late", via: .laIntent, scope: "trip_day",
            clientTs: now,
            payload: ["trip_id": .text(tripId), "meetup_id": .text(meetupId), "minutes": .number(minutes)]
        )
    }

    /// PING ALL and ON MY WAY on the crew-live activity: `ping_all{trip_id, kind}`.
    static func pingAll(
        tripId: String, onMyWay: Bool, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "ping_all", via: .laIntent, scope: "trip_day", clientTs: now,
            payload: ["trip_id": .text(tripId), "kind": onMyWay ? "on_my_way" : "ping"]
        )
    }

    /// SOS from the lock screen, after its confirmation: `trigger_sos{trip_id}`.
    static func sos(
        tripId: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "trigger_sos", via: .laIntent, scope: "sos", clientTs: now,
            payload: ["trip_id": .text(tripId)]
        )
    }

    /// I'M GOING on a crewmate's SOS: `respond_sos{sos_id, state: coming}`.
    static func coming(
        sosId: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "respond_sos", via: .laIntent, scope: "sos", clientTs: now,
            payload: ["sos_id": .text(sosId), "state": "coming"]
        )
    }

    /// A vote from the vote activity or the vote widget: `cast_ballot{poll_id, option_id}`.
    static func ballot(
        pollId: String, optionId: String, via: Via,
        opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "cast_ballot", via: via, scope: "ballot", clientTs: now,
            payload: ["poll_id": .text(pollId), "option_id": .text(optionId)]
        )
    }

    /// DONE or NUDGE on a Today widget item: `act_briefing_item{item_id, action}`.
    static func briefing(
        itemId: String, action: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "act_briefing_item", via: .widget, scope: "trip_day", clientTs: now,
            payload: ["item_id": .text(itemId), "action": .text(action)]
        )
    }

    /// NUDGE <NAME> on the Balances widget: `send_nudge{target_uid, reason: payment, context}`.
    static func paymentNudge(
        targetUid: String, tripId: String, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "send_nudge", via: .widget, scope: "money_nudge", clientTs: now,
            payload: [
                "target_uid": .text(targetUid), "reason": "payment",
                "context": .fields(["kind": "trip", "id": tripId]),
            ]
        )
    }

    /// A packing item ticked on the Today widget: `check_packing_item{item_id, checked}`.
    static func packingCheck(
        itemId: String, checked: Bool, opId: String = PendingAction.uuidV7(), now: Date = Date()
    ) -> PendingAction {
        PendingAction(
            opId: opId, cmd: "check_packing_item", via: .widget, scope: "trip_day", clientTs: now,
            payload: ["item_id": .text(itemId), "checked": .flag(checked)]
        )
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
        let groups = [(0, 8), (8, 4), (12, 4), (16, 4), (20, 12)].map { start, length in
            String(hex.dropFirst(start).prefix(length))
        }
        return groups.joined(separator: "-")
    }
}

/// One payload value: text, a whole number, a flag or an object of text values. The file itself
/// may hold any JSON (entries written by other builds are kept exactly as they are).
enum PendingActionValue: Hashable, Sendable, ExpressibleByStringLiteral {
    case text(String)
    case number(Int)
    case flag(Bool)
    /// A nested object of text values (`send_nudge`'s `context`).
    case fields([String: String])

    init(stringLiteral value: String) { self = .text(value) }

    var json: Any {
        switch self {
        case .text(let value): return value
        case .number(let value): return value
        case .flag(let value): return value
        case .fields(let value): return value
        }
    }
}

enum PendingActionsOutboxError: Error, Sendable, Equatable {
    case noAppGroupContainer
    /// Written by a newer build: left untouched rather than rewritten in a shape it did not expect.
    case unsupportedSchema
    case writeFailed(Int32)
}

/// Appends to `state/pending-actions.json` with the same file contract as the app's own store
/// (modules/cp-app-group/ios/AppGroupStore.swift): one coordinated read-modify-write, entries other
/// writers queued kept as they are, and a temp file renamed over the target so a reader never
/// sees a half-written file.
enum PendingActionsOutbox {
    static let schemaVersion = 1
    static let relativePath = "state/pending-actions.json"

    /// `root` is the App Group container (`AppGroupContainer.url`), nil when the entitlement is missing.
    static func append(_ action: PendingAction, root: URL?, now: Date = Date()) throws {
        guard let root else { throw PendingActionsOutboxError.noAppGroupContainer }
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var coordinationError: NSError?
        var result: Result<Void, Error> = .success(())
        NSFileCoordinator(filePresenter: nil).coordinate(
            writingItemAt: url, options: .forReplacing, error: &coordinationError
        ) { url in
            result = Result { try appendLocked(action, at: url, now: now) }
        }
        if let coordinationError { throw coordinationError }
        try result.get()
    }

    static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func appendLocked(_ action: PendingAction, at url: URL, now: Date) throws {
        var file: [String: Any] = ["schema": schemaVersion, "actions": [Any]()]
        if FileManager.default.fileExists(atPath: url.path) {
            let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
            guard let existing = object as? [String: Any], existing["schema"] as? Int == schemaVersion
            else { throw PendingActionsOutboxError.unsupportedSchema }
            file = existing
        }
        file["actions"] = (file["actions"] as? [Any] ?? []) + [action.entry]
        file["generated_at"] = timestamp(now)
        let data = try JSONSerialization.data(withJSONObject: file, options: [.sortedKeys])

        let temp = url.deletingLastPathComponent()
            .appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        do {
            try data.write(to: temp)
            guard rename(temp.path, url.path) == 0 else {
                throw PendingActionsOutboxError.writeFailed(errno)
            }
        } catch {
            try? FileManager.default.removeItem(at: temp)
            throw error
        }
    }
}
