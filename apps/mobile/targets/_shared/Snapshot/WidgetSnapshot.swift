// Generated from packages/domain `widgetSnapshotSchema` by
// src/features/home/widget-gallery/snapshot-swift-source.ts. Do not edit by hand.

import Foundation

public struct WSTrip: Codable, Hashable, Sendable {
    public var id: String
    public var destination: String?
    public var status: String
    public var startDate: String?
    public var endDate: String?
    public var tz: String?

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case destination = "destination"
        case status = "status"
        case startDate = "start_date"
        case endDate = "end_date"
        case tz = "tz"
    }
}

public struct WSCountdown: Codable, Hashable, Sendable {
    public var targetAt: String

    enum CodingKeys: String, CodingKey {
        case targetAt = "target_at"
    }
}

public struct WSOption: Codable, Hashable, Sendable {
    public var id: String
    public var label: String
    public var votes: Int

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case label = "label"
        case votes = "votes"
    }
}

public struct WSVote: Codable, Hashable, Sendable {
    public var pollId: String
    public var question: String?
    public var status: String
    public var closesAt: String?
    public var options: [WSOption]
    public var voted: Int
    public var eligible: Int
    public var myOptionId: String?
    public var winnerOptionId: String?

    enum CodingKeys: String, CodingKey {
        case pollId = "poll_id"
        case question = "question"
        case status = "status"
        case closesAt = "closes_at"
        case options = "options"
        case voted = "voted"
        case eligible = "eligible"
        case myOptionId = "my_option_id"
        case winnerOptionId = "winner_option_id"
    }
}

public struct WSItem: Codable, Hashable, Sendable {
    public var id: String
    public var icon: String
    public var text: String
    public var action: String
    public var status: String
    public var deepLink: String?

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case icon = "icon"
        case text = "text"
        case action = "action"
        case status = "status"
        case deepLink = "deep_link"
    }
}

public struct WSPlan: Codable, Hashable, Sendable {
    public var id: String
    public var startsAt: String
    public var title: String

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case startsAt = "starts_at"
        case title = "title"
    }
}

public struct WSPacking: Codable, Hashable, Sendable {
    public var id: String
    public var label: String
    public var checked: Bool

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case label = "label"
        case checked = "checked"
    }
}

public struct WSForecast: Codable, Hashable, Sendable {
    public var tempMaxC: Int
    public var condition: String
    public var rainFrom: String?

    enum CodingKeys: String, CodingKey {
        case tempMaxC = "temp_max_c"
        case condition = "condition"
        case rainFrom = "rain_from"
    }
}

public struct WSToday: Codable, Hashable, Sendable {
    public var localDate: String
    public var items: [WSItem]
    public var plan: [WSPlan]?
    public var packing: [WSPacking]?
    public var forecast: WSForecast?

    enum CodingKeys: String, CodingKey {
        case localDate = "local_date"
        case items = "items"
        case plan = "plan"
        case packing = "packing"
        case forecast = "forecast"
    }
}

public struct WSNudge: Codable, Hashable, Sendable {
    public var userId: String
    public var firstName: String
    public var availableAt: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case firstName = "first_name"
        case availableAt = "available_at"
    }
}

public struct WSBalances: Codable, Hashable, Sendable {
    public var currency: String
    public var netMinor: Int
    public var nudge: WSNudge?

    enum CodingKeys: String, CodingKey {
        case currency = "currency"
        case netMinor = "net_minor"
        case nudge = "nudge"
    }
}

public struct WSMeetup: Codable, Hashable, Sendable {
    public var placeName: String
    public var meetAt: String

    enum CodingKeys: String, CodingKey {
        case placeName = "place_name"
        case meetAt = "meet_at"
    }
}

public struct WSMember: Codable, Hashable, Sendable {
    public var userId: String
    public var bucket: String
    public var initial: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case bucket = "bucket"
        case initial = "initial"
    }
}

public struct WSCrew: Codable, Hashable, Sendable {
    public var meetup: WSMeetup?
    public var members: [WSMember]

    enum CodingKeys: String, CodingKey {
        case meetup = "meetup"
        case members = "members"
    }
}

public struct WSCritterdex: Codable, Hashable, Sendable {
    public var found: Int
    public var total: Int

    enum CodingKeys: String, CodingKey {
        case found = "found"
        case total = "total"
    }
}

public struct WSNextFlight: Codable, Hashable, Sendable {
    public var id: String
    public var carrier: String
    public var flightNo: String
    public var depAirport: String
    public var arrAirport: String
    public var departsAt: String
    public var boardingAt: String?
    public var gate: String?
    public var terminal: String?
    public var status: String
    public var delayMin: Int?

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case carrier = "carrier"
        case flightNo = "flight_no"
        case depAirport = "dep_airport"
        case arrAirport = "arr_airport"
        case departsAt = "departs_at"
        case boardingAt = "boarding_at"
        case gate = "gate"
        case terminal = "terminal"
        case status = "status"
        case delayMin = "delay_min"
    }
}

public struct WSNextLeaveBy: Codable, Hashable, Sendable {
    public var id: String
    public var title: String
    public var placeName: String?
    public var leaveAt: String
    public var state: String

    enum CodingKeys: String, CodingKey {
        case id = "id"
        case title = "title"
        case placeName = "place_name"
        case leaveAt = "leave_at"
        case state = "state"
    }
}

public struct WSEntitlements: Codable, Hashable, Sendable {
    public var passPlus: Bool
    public var boostActive: Bool

    enum CodingKeys: String, CodingKey {
        case passPlus = "pass_plus"
        case boostActive = "boost_active"
    }
}

public struct WidgetSnapshot: Codable, Hashable, Sendable {
    public var schema: Int
    public var generatedAt: String
    public var trip: WSTrip?
    public var countdown: WSCountdown?
    public var vote: WSVote?
    public var today: WSToday?
    public var balances: WSBalances?
    public var crew: WSCrew?
    public var critterdex: WSCritterdex
    public var nextFlight: WSNextFlight?
    public var nextLeaveBy: WSNextLeaveBy?
    public var entitlements: WSEntitlements
    public var locked: [String]

    enum CodingKeys: String, CodingKey {
        case schema = "schema"
        case generatedAt = "generated_at"
        case trip = "trip"
        case countdown = "countdown"
        case vote = "vote"
        case today = "today"
        case balances = "balances"
        case crew = "crew"
        case critterdex = "critterdex"
        case nextFlight = "next_flight"
        case nextLeaveBy = "next_leave_by"
        case entitlements = "entitlements"
        case locked = "locked"
    }
}
