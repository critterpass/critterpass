import ActivityKit
import Foundation

/// One activity as the JS side sees it: its id on this phone, its kind and its static attributes
/// (JSON, in the domain's wire shape).
struct LiveActivityRecord: Sendable {
    let id: String
    let kind: String
    let attributesJson: String
}

/// Where the observers send what ActivityKit tells them.
protocol LiveActivityEvents: Sendable {
    func pushToStartToken(kind: String, token: String)
    func updateToken(_ record: LiveActivityRecord, token: String)
    func phase(_ record: LiveActivityRecord, _ phase: LiveActivityPhase)
}

enum LiveActivityError: Error, CustomStringConvertible {
    case unknownKind(String)
    case notFound(String)

    var description: String {
        switch self {
        case .unknownKind(let kind): return "No Live Activity kind \(kind)"
        case .notFound(let id): return "No Live Activity \(id) on this phone"
        }
    }
}

/// One kind's ActivityKit calls over JSON in the domain's wire shape
/// (packages/domain/src/surfaces/la-*.ts), so the module needs no per-kind code.
protocol LiveActivityKindBridge: Sendable {
    var kind: String { get }
    func start(attributes: Data, state: Data, staleDate: Date?, relevance: Double, channelId: String?)
        throws -> String
    func update(id: String, state: Data, staleDate: Date?, relevance: Double) async throws
    func end(id: String, state: Data?, dismissAt: Date?) async throws
    func current() -> [(LiveActivityRecord, LiveActivityPhase)]
    func observe(_ events: LiveActivityEvents) -> [Task<Void, Never>]
}

struct ActivityKindBridge<A: ActivityAttributes>: LiveActivityKindBridge
where A: Sendable, A.ContentState: Sendable {
    let kind: String

    func start(attributes: Data, state: Data, staleDate: Date?, relevance: Double, channelId: String?)
        throws -> String
    {
        let content = ActivityContent(
            state: try JSONDecoder().decode(A.ContentState.self, from: state),
            staleDate: staleDate, relevanceScore: relevance)
        let activity = try Activity<A>.request(
            attributes: try JSONDecoder().decode(A.self, from: attributes),
            content: content,
            pushType: channelId.map { PushType.channel($0) } ?? .token)
        return activity.id
    }

    func update(id: String, state: Data, staleDate: Date?, relevance: Double) async throws {
        let content = ActivityContent(
            state: try JSONDecoder().decode(A.ContentState.self, from: state),
            staleDate: staleDate, relevanceScore: relevance)
        try await find(id).update(content)
    }

    func end(id: String, state: Data?, dismissAt: Date?) async throws {
        let activity = try find(id)
        let content = try state.map {
            ActivityContent(
                state: try JSONDecoder().decode(A.ContentState.self, from: $0), staleDate: nil)
        }
        await activity.end(content, dismissalPolicy: dismissAt.map { .after($0) } ?? .default)
    }

    func current() -> [(LiveActivityRecord, LiveActivityPhase)] {
        Activity<A>.activities.map { (record($0), Self.phase($0.activityState)) }
    }

    func observe(_ events: LiveActivityEvents) -> [Task<Void, Never>] {
        let kind = self.kind
        let tokens = Task {
            for await token in Activity<A>.pushToStartTokenUpdates {
                events.pushToStartToken(kind: kind, token: token.hexToken)
            }
        }
        let activities = Task {
            await withTaskGroup(of: Void.self) { group in
                var watched = Set<String>()
                for activity in Activity<A>.activities where watched.insert(activity.id).inserted {
                    let held = Held(activity)
                    group.addTask { await watch(held, events) }
                }
                for await activity in Activity<A>.activityUpdates
                where watched.insert(activity.id).inserted {
                    let held = Held(activity)
                    group.addTask { await watch(held, events) }
                }
            }
        }
        return [tokens, activities]
    }

    private func watch(_ held: Held<Activity<A>>, _ events: LiveActivityEvents) async {
        let record = record(held.value)
        events.phase(record, Self.phase(held.value.activityState))
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                for await token in held.value.pushTokenUpdates {
                    events.updateToken(record, token: token.hexToken)
                }
            }
            group.addTask {
                for await state in held.value.activityStateUpdates {
                    events.phase(record, Self.phase(state))
                }
            }
        }
    }

    private func find(_ id: String) throws -> Activity<A> {
        guard let activity = Activity<A>.activities.first(where: { $0.id == id }) else {
            throw LiveActivityError.notFound(id)
        }
        return activity
    }

    private func record(_ activity: Activity<A>) -> LiveActivityRecord {
        let json = (try? JSONEncoder().encode(activity.attributes))
            .flatMap { String(data: $0, encoding: .utf8) }
        return LiveActivityRecord(id: activity.id, kind: kind, attributesJson: json ?? "{}")
    }

    static func phase(_ state: ActivityState) -> LiveActivityPhase {
        switch state {
        case .active: return .active
        case .stale: return .stale
        case .ended: return .ended
        case .dismissed: return .dismissed
        case .pending: return .pending
        @unknown default: return .active
        }
    }
}

/// Carries an ActivityKit `Activity` (a class ActivityKit does not mark Sendable) into the tasks that
/// watch it; each task only reads its async sequences, which ActivityKit serves to any caller.
struct Held<Value>: @unchecked Sendable {
    let value: Value
    init(_ value: Value) { self.value = value }
}

/// Every kind the server drives, by its wire name (packages/domain LA_KINDS; the alarm's
/// activity belongs to AlarmKit and modules/cp-alarm).
enum LiveActivityKinds {
    static let all: [any LiveActivityKindBridge] = [
        ActivityKindBridge<LeaveByActivityAttributes>(kind: "leave_by"),
        ActivityKindBridge<MeetUpActivityAttributes>(kind: "meet_up"),
        ActivityKindBridge<FlightActivityAttributes>(kind: "flight"),
        ActivityKindBridge<VoteActivityAttributes>(kind: "vote"),
        ActivityKindBridge<CritterNearbyActivityAttributes>(kind: "critter_nearby"),
        ActivityKindBridge<StormActivityAttributes>(kind: "storm"),
        ActivityKindBridge<SOSActivityAttributes>(kind: "sos"),
        ActivityKindBridge<RideActivityAttributes>(kind: "ride"),
    ]

    static func named(_ kind: String) throws -> any LiveActivityKindBridge {
        guard let bridge = all.first(where: { $0.kind == kind }) else {
            throw LiveActivityError.unknownKind(kind)
        }
        return bridge
    }
}
