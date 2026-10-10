// Generated from packages/domain Live Activity contracts by
// src/features/trip/live-activities/test-support/activity-attributes.ts. Do not edit by hand.

import ActivityKit
import Foundation

public enum LASOSState: String, Codable, Hashable, Sendable {
    case `open` = "open"
    case responding = "responding"
    case resolved = "resolved"
    case cancelled = "cancelled"
}

public struct SOSActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LASOSState
        public var responders: Int
        public var lastSeenMin: Int?

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case responders = "responders"
            case lastSeenMin = "last_seen_min"
        }
    }

    public var sosId: String
    public var senderName: String

    enum CodingKeys: String, CodingKey {
        case sosId = "sos_id"
        case senderName = "sender_name"
    }
}

public enum LALeaveByState: String, Codable, Hashable, Sendable {
    case waiting = "waiting"
    case soon = "soon"
    case go = "go"
    case late = "late"
    case done = "done"
}

public struct LALeaveByPip: Codable, Hashable, Sendable {
    public var uidHash: String
    public var up: Bool

    enum CodingKeys: String, CodingKey {
        case uidHash = "uid_hash"
        case up = "up"
    }
}

public struct LeaveByActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var leaveAt: Int
        public var state: LALeaveByState
        public var upCount: Int
        public var total: Int
        public var pips: [LALeaveByPip]
        public var leg: Int
        public var progress: Int
        public var placeLine: String
        public var guideLine: String

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case leaveAt = "leave_at"
            case state = "state"
            case upCount = "up_count"
            case total = "total"
            case pips = "pips"
            case leg = "leg"
            case progress = "progress"
            case placeLine = "place_line"
            case guideLine = "guide_line"
        }
    }

    public var tripId: String
    public var leaveById: String
    public var title: String
    public var legs: [String]
    public var guide: String

    enum CodingKeys: String, CodingKey {
        case tripId = "trip_id"
        case leaveById = "leave_by_id"
        case title = "title"
        case legs = "legs"
        case guide = "guide"
    }
}

public enum LAFlightPhase: String, Codable, Hashable, Sendable {
    case checkIn = "check_in"
    case boarding = "boarding"
    case departed = "departed"
    case landed = "landed"
    case pickup = "pickup"
    case cancelled = "cancelled"
    case diverted = "diverted"
}

public enum LAFlightColour: String, Codable, Hashable, Sendable {
    case `default` = "default"
    case orange = "orange"
    case red = "red"
}

public struct LAFlightPickup: Codable, Hashable, Sendable {
    public var name: String
    public var line: String

    enum CodingKeys: String, CodingKey {
        case name = "name"
        case line = "line"
    }
}

public struct FlightActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var phase: LAFlightPhase
        public var sched: Int
        public var est: Int?
        public var boardingAt: Int?
        public var arrAt: Int?
        public var gate: String?
        public var terminal: String?
        public var seat: String?
        public var delayMin: Int?
        public var colour: LAFlightColour
        public var pickup: LAFlightPickup?
        public var grabCta: Bool

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case phase = "phase"
            case sched = "sched"
            case est = "est"
            case boardingAt = "boarding_at"
            case arrAt = "arr_at"
            case gate = "gate"
            case terminal = "terminal"
            case seat = "seat"
            case delayMin = "delay_min"
            case colour = "colour"
            case pickup = "pickup"
            case grabCta = "grab_cta"
        }
    }

    public var bookingId: String
    public var segmentId: String
    public var flightNo: String
    public var route: String
    public var from: String
    public var to: String
    public var fromEmail: Bool

    enum CodingKeys: String, CodingKey {
        case bookingId = "booking_id"
        case segmentId = "segment_id"
        case flightNo = "flight_no"
        case route = "route"
        case from = "from"
        case to = "to"
        case fromEmail = "from_email"
    }
}

public enum LAMeetUpState: String, Codable, Hashable, Sendable {
    case gathering = "gathering"
    case close = "close"
    case arrived = "arrived"
    case late = "late"
    case ended = "ended"
}

public struct LAMeetUpMember: Codable, Hashable, Sendable {
    public var uidHash: String
    public var initial: String
    public var tone: Int
    public var step: Int
    public var min: Int?
    public var arrived: Bool

    enum CodingKeys: String, CodingKey {
        case uidHash = "uid_hash"
        case initial = "initial"
        case tone = "tone"
        case step = "step"
        case min = "min"
        case arrived = "arrived"
    }
}

public struct LAMeetUpStraggler: Codable, Hashable, Sendable {
    public var name: String
    public var initial: String
    public var tone: Int
    public var line: String
    public var min: Int?

    enum CodingKeys: String, CodingKey {
        case name = "name"
        case initial = "initial"
        case tone = "tone"
        case line = "line"
        case min = "min"
    }
}

public enum LAMeetUpEndReason: String, Codable, Hashable, Sendable {
    case allArrived = "all_arrived"
    case timedOut = "timed_out"
    case boostEnded = "boost_ended"
    case cancelled = "cancelled"
}

public struct MeetUpActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LAMeetUpState
        public var etaMin: Int?
        public var allUnder5: Bool
        public var members: [LAMeetUpMember]
        public var stragglers: [LAMeetUpStraggler]
        public var endReason: LAMeetUpEndReason?

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case etaMin = "eta_min"
            case allUnder5 = "all_under_5"
            case members = "members"
            case stragglers = "stragglers"
            case endReason = "end_reason"
        }
    }

    public var tripId: String
    public var meetupId: String
    public var placeName: String
    public var meetAt: Int

    enum CodingKeys: String, CodingKey {
        case tripId = "trip_id"
        case meetupId = "meetup_id"
        case placeName = "place_name"
        case meetAt = "meet_at"
    }
}

public enum LARideState: String, Codable, Hashable, Sendable {
    case quoted = "quoted"
    case expired = "expired"
}

public enum LARideProvider: String, Codable, Hashable, Sendable {
    case grab = "grab"
}

public struct RideActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LARideState
        public var serviceName: String
        public var fareLow: Double
        public var fareHigh: Double
        public var currency: String
        public var etaMin: Int
        public var surge: Bool
        public var fetchedAt: Int
        public var deepLink: String

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case serviceName = "service_name"
            case fareLow = "fare_low"
            case fareHigh = "fare_high"
            case currency = "currency"
            case etaMin = "eta_min"
            case surge = "surge"
            case fetchedAt = "fetched_at"
            case deepLink = "deep_link"
        }
    }

    public var tripId: String
    public var quoteId: String
    public var provider: LARideProvider
    public var route: String

    enum CodingKeys: String, CodingKey {
        case tripId = "trip_id"
        case quoteId = "quote_id"
        case provider = "provider"
        case route = "route"
    }
}

public enum LAStormState: String, Codable, Hashable, Sendable {
    case active = "active"
    case passed = "passed"
}

public enum LAStormSeverity: String, Codable, Hashable, Sendable {
    case advisory = "advisory"
    case watch = "watch"
    case warning = "warning"
}

public struct StormActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LAStormState
        public var severity: LAStormSeverity
        public var windowStart: Int
        public var windowEnd: Int
        public var headline: String
        public var actionLine: String

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case severity = "severity"
            case windowStart = "window_start"
            case windowEnd = "window_end"
            case headline = "headline"
            case actionLine = "action_line"
        }
    }

    public var tripId: String
    public var watchId: String

    enum CodingKeys: String, CodingKey {
        case tripId = "trip_id"
        case watchId = "watch_id"
    }
}

public enum LAVoteState: String, Codable, Hashable, Sendable {
    case `open` = "open"
    case closed = "closed"
    case cancelled = "cancelled"
}

public struct LAVoteTally: Codable, Hashable, Sendable {
    public var optionId: String
    public var label: String
    public var count: Int
    public var leading: Bool

    enum CodingKeys: String, CodingKey {
        case optionId = "option_id"
        case label = "label"
        case count = "count"
        case leading = "leading"
    }
}

public struct VoteActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LAVoteState
        public var closesAt: Int
        public var tallies: [LAVoteTally]
        public var voted: [String]
        public var eligible: Int
        public var winnerLabel: String?

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case closesAt = "closes_at"
            case tallies = "tallies"
            case voted = "voted"
            case eligible = "eligible"
            case winnerLabel = "winner_label"
        }
    }

    public var pollId: String
    public var question: String

    enum CodingKeys: String, CodingKey {
        case pollId = "poll_id"
        case question = "question"
    }
}

public enum LACritterNearbyState: String, Codable, Hashable, Sendable {
    case dwelling = "dwelling"
    case draining = "draining"
    case caught = "caught"
    case expired = "expired"
}

public enum LACritterNearbyDistanceBand: String, Codable, Hashable, Sendable {
    case near = "near"
    case close = "close"
    case here = "here"
}

public struct CritterNearbyActivityAttributes: ActivityAttributes, Hashable, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        public var seq: Int
        public var state: LACritterNearbyState
        public var distanceBand: LACritterNearbyDistanceBand
        public var ring: Int
        public var blurStage: Int
        public var foundKey: String?
        public var remainMin: Int?
        public var endsAt: Int?

        enum CodingKeys: String, CodingKey {
            case seq = "seq"
            case state = "state"
            case distanceBand = "distance_band"
            case ring = "ring"
            case blurStage = "blur_stage"
            case foundKey = "found_key"
            case remainMin = "remain_min"
            case endsAt = "ends_at"
        }
    }

    public var spawnId: String
    public var silhouetteKey: String
    public var placeName: String?

    enum CodingKeys: String, CodingKey {
        case spawnId = "spawn_id"
        case silhouetteKey = "silhouette_key"
        case placeName = "place_name"
    }
}
