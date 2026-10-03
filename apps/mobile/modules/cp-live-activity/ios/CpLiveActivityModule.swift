import ActivityKit
import ExpoModulesCore
import Foundation

/// Live Activities on iOS (modules/cp-live-activity/index.ts): starts, updates and ends the app's
/// own activities, and relays what ActivityKit reports (push-to-start tokens per kind, each
/// activity's update token and state) so the app can register them with the server. Observation
/// starts when the module is created, so an activity a push started while the app slept is seen
/// on the next launch; events wait until JS listens.
public class CpLiveActivityModule: Module {
    private let relay = LiveActivityRelay()

    public func definition() -> ModuleDefinition {
        let relay = self.relay

        Name("CpLiveActivity")

        Events("onPushToStartToken", "onUpdateToken", "onActivityState")

        OnCreate {
            relay.module = self
            relay.begin()
        }

        OnStartObserving {
            relay.setObserving(true)
        }

        OnStopObserving {
            relay.setObserving(false)
        }

        Function("authorization") { () -> [String: Bool] in
            let info = ActivityAuthorizationInfo()
            return ["enabled": info.areActivitiesEnabled, "frequent": info.frequentPushesEnabled]
        }

        // Every kind here has a view in the widget extension of the same build (a test holds the
        // two together), so the server may push-start exactly these on this phone.
        Function("drawnKinds") { () -> [String] in
            LiveActivityKinds.all.map(\.kind)
        }

        AsyncFunction("start") { (request: [String: Any]) throws -> String in
            let bridge = try LiveActivityKinds.named(try Self.string(request, "kind"))
            return try bridge.start(
                attributes: try Self.json(request["attributes"]),
                state: try Self.json(request["state"]),
                staleDate: Self.date(request["staleDate"]),
                relevance: request["relevance"] as? Double ?? 0,
                channelId: request["channelId"] as? String)
        }

        AsyncFunction("update") { (request: [String: Any]) async throws in
            let bridge = try LiveActivityKinds.named(try Self.string(request, "kind"))
            try await bridge.update(
                id: try Self.string(request, "id"),
                state: try Self.json(request["state"]),
                staleDate: Self.date(request["staleDate"]),
                relevance: request["relevance"] as? Double ?? 0)
        }

        AsyncFunction("end") { (request: [String: Any]) async throws in
            let bridge = try LiveActivityKinds.named(try Self.string(request, "kind"))
            let state = request["state"] == nil ? nil : try Self.json(request["state"])
            try await bridge.end(
                id: try Self.string(request, "id"), state: state,
                dismissAt: Self.date(request["dismissAt"]))
        }

        Function("list") { () -> [[String: Any]] in
            LiveActivityKinds.all.flatMap { bridge in
                bridge.current().map { record, phase in
                    LiveActivityRelay.body(record, extra: ["state": phase.rawValue])
                }
            }
        }
    }

    private static func string(_ request: [String: Any], _ key: String) throws -> String {
        guard let value = request[key] as? String, !value.isEmpty else {
            throw Exception(
                name: "LiveActivityRequest", description: "\(key) is required",
                code: "ERR_LIVE_ACTIVITY_REQUEST")
        }
        return value
    }

    private static func json(_ value: Any?) throws -> Data {
        guard let value, JSONSerialization.isValidJSONObject(value) else {
            throw Exception(
                name: "LiveActivityRequest", description: "attributes and state must be objects",
                code: "ERR_LIVE_ACTIVITY_REQUEST")
        }
        return try JSONSerialization.data(withJSONObject: value)
    }

    /// Dates cross the bridge as unix seconds.
    private static func date(_ value: Any?) -> Date? {
        (value as? Double).map { Date(timeIntervalSince1970: $0) }
    }
}

/// Holds what ActivityKit reported until JS listens, then forwards it as it happens. The latest
/// push-to-start token per kind, update token per activity and state per activity are replayed
/// each time JS starts listening (the JS side sends each value to the server once).
final class LiveActivityRelay: LiveActivityEvents, @unchecked Sendable {
    private let lock = NSLock()
    private weak var owner: Module?
    private var observing = false
    private var tasks: [Task<Void, Never>] = []
    private var ledger = LiveActivityLedger()
    private var startTokens: [String: [String: Any]] = [:]
    private var updateTokens: [String: [String: Any]] = [:]
    private var phases: [String: [String: Any]] = [:]

    var module: Module? {
        get { lock.withLock { owner } }
        set { lock.withLock { owner = newValue } }
    }

    func begin() {
        guard lock.withLock({ tasks.isEmpty }) else { return }
        let started = LiveActivityKinds.all.flatMap { $0.observe(self) }
        lock.withLock { tasks = started }
    }

    func setObserving(_ on: Bool) {
        let replay: [(String, [String: Any])] = lock.withLock {
            observing = on
            guard on else { return [] }
            return startTokens.values.map { ("onPushToStartToken", $0) }
                + updateTokens.values.map { ("onUpdateToken", $0) }
                + phases.values.map { ("onActivityState", $0) }
        }
        let target = module
        for (name, body) in replay { target?.sendEvent(name, body) }
    }

    func pushToStartToken(kind: String, token: String) {
        let body: [String: Any] = ["kind": kind, "token": token]
        lock.withLock { startTokens[kind] = body }
        emit("onPushToStartToken", body)
    }

    func updateToken(_ record: LiveActivityRecord, token: String) {
        let body = Self.body(record, extra: ["token": token])
        lock.withLock { updateTokens[record.id] = body }
        emit("onUpdateToken", body)
    }

    func phase(_ record: LiveActivityRecord, _ phase: LiveActivityPhase) {
        let report: LiveActivityPhase? = lock.withLock { ledger.report(record.id, phase) }
        guard let report else { return }
        let body = Self.body(record, extra: ["state": report.rawValue])
        lock.withLock { phases[record.id] = body }
        emit("onActivityState", body)
    }

    private func emit(_ name: String, _ body: [String: Any]) {
        let target: Module? = lock.withLock { observing ? owner : nil }
        target?.sendEvent(name, body)
    }

    static func body(_ record: LiveActivityRecord, extra: [String: Any]) -> [String: Any] {
        let decoded = record.attributesJson.data(using: .utf8)
            .flatMap { try? JSONSerialization.jsonObject(with: $0) }
        var body: [String: Any] = [
            "id": record.id, "kind": record.kind, "attributes": decoded ?? [String: Any](),
        ]
        body.merge(extra) { _, new in new }
        return body
    }
}
