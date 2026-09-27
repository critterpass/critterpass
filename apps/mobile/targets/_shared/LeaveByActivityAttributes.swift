import ActivityKit
import Foundation

/// Live Activity contract for the "leave-by" journey (api-contracts-async.md §3.2, `LeaveBy`
/// row). Content-state stays under the 4 KB APNs limit: ETA/state text only, never coordinates.
struct LeaveByActivityAttributes: ActivityAttributes, Sendable {
    struct ContentState: Codable, Hashable, Sendable {
        enum ReadinessState: String, Codable, Sendable {
            case waiting, soon, go, late, done
        }

        struct CrewPip: Codable, Hashable, Sendable {
            let uidHash: String
            let up: Bool

            enum CodingKeys: String, CodingKey {
                case uidHash = "uid_hash"
                case up
            }
        }

        let leaveAt: Date
        let state: ReadinessState
        let upCount: Int
        let total: Int
        let pips: [CrewPip]
        let leg: String
        let guideLine: String

        enum CodingKeys: String, CodingKey {
            case leaveAt = "leave_at"
            case state
            case upCount = "up_count"
            case total
            case pips
            case leg
            case guideLine = "guide_line"
        }
    }

    let tripId: String
    let leaveById: String
    let title: String
    let legs: [String]

    enum CodingKeys: String, CodingKey {
        case tripId = "trip_id"
        case leaveById = "leave_by_id"
        case title
        case legs
    }
}
