import Foundation

// What the trip widgets (5c-2), the lock-screen accessories (5c-3) and the StandBy pair (5c-4)
// show for a snapshot, kept free of SwiftUI and WidgetKit so the host tests run it.

/// The Today widget: the day's briefing items in order, finished ones struck through.
struct TodayFace: Equatable {
    struct Row: Equatable {
        let id: String
        let text: String
        /// Done, nudged, set or opened: struck through and faded.
        let finished: Bool
        /// The item's own action when it can be acted on from the widget (`done` or `nudge`).
        let action: String?
    }

    let rows: [Row]
    /// Items beyond what the widget shows.
    let more: Int

    /// Up to `limit` rows; a tap made on this phone (`acted`) counts as finished at once.
    static func make(today: WSToday?, acted: Set<String> = [], limit: Int = 5) -> TodayFace? {
        guard let today, !today.items.isEmpty else { return nil }
        let rows = today.items.prefix(limit).map { item -> Row in
            let finished = item.status != "open" || acted.contains(item.id)
            let actionable = !finished && (item.action == "done" || item.action == "nudge")
            return Row(id: item.id, text: item.text, finished: finished, action: actionable ? item.action : nil)
        }
        return TodayFace(rows: rows, more: max(0, today.items.count - limit))
    }
}

/// The balances widget: what the viewer is owed or owes on this trip, net, in its currency.
enum BalanceFace: Equatable {
    case owed(String)
    case owes(String)
    case settled

    static func make(_ balances: WSBalances?, locale: Locale = .current) -> BalanceFace? {
        guard let balances else { return nil }
        if balances.netMinor == 0 { return .settled }
        let text = MoneyText.format(minor: abs(balances.netMinor), currency: balances.currency, locale: locale)
        return balances.netMinor > 0 ? .owed(text) : .owes(text)
    }
}

/// Minor units in the currency's own decimals ("$186", "¥4,200", "Rp 60.000"), whole amounts
/// without decimals.
enum MoneyText {
    static func format(minor: Int, currency: String, locale: Locale = .current) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.locale = locale
        let digits = max(0, formatter.maximumFractionDigits)
        var divisor = 1
        for _ in 0..<digits { divisor *= 10 }
        let major = Double(minor) / Double(divisor)
        if minor % divisor == 0 {
            formatter.maximumFractionDigits = 0
            formatter.minimumFractionDigits = 0
        }
        return formatter.string(from: NSNumber(value: major)) ?? "\(currency) \(major)"
    }
}

/// The crew widget: every member as a dot by how far out they are, the meet-up's flag at the end.
struct CrewFace: Equatable {
    struct Dot: Equatable {
        /// The member's place in the snapshot (their colour slot).
        let index: Int
        /// 0 (far) to 1 (at the flag); members not sharing sit at the far end, dimmed.
        let x: Double
        let row: Int
        let known: Bool
    }

    let place: String?
    let meetAt: Date?
    let dots: [Dot]
    let here: Int
    let total: Int

    static func make(crew: WSCrew?) -> CrewFace? {
        guard let crew else { return nil }
        var taken: [Double: Int] = [:]
        let dots = crew.members.prefix(16).enumerated().map { index, member -> Dot in
            let x: Double
            switch member.bucket {
            case "here": x = 0.92
            case "close": x = 0.62
            case "on_way": x = 0.3
            default: x = 0.06
            }
            let stacked = taken[x, default: 0]
            taken[x] = stacked + 1
            let row = stacked == 0 ? 0 : (stacked % 2 == 1 ? -1 : 1) * ((stacked + 1) / 2)
            return Dot(index: index, x: x, row: row, known: member.bucket != "unknown")
        }
        return CrewFace(
            place: crew.meetup?.placeName, meetAt: WidgetDate.parse(crew.meetup?.meetAt),
            dots: dots, here: crew.members.filter { $0.bucket == "here" }.count,
            total: crew.members.count)
    }
}

/// The next-flight widget: the route, flight and the next time that matters.
struct FlightFace: Equatable {
    enum Next: Equatable {
        case boarding(Date)
        case departs(Date)
        case departed
    }

    let route: String
    let flight: String
    let gate: String?
    let next: Next
    let delayMin: Int?
    let cancelled: Bool

    static func make(_ flight: WSNextFlight?, now: Date) -> FlightFace? {
        guard let flight, let departs = WidgetDate.parse(flight.departsAt) else { return nil }
        let next: Next
        if let boarding = WidgetDate.parse(flight.boardingAt), boarding > now {
            next = .boarding(boarding)
        } else if departs > now {
            next = .departs(departs)
        } else {
            next = .departed
        }
        return FlightFace(
            route: "\(flight.depAirport) → \(flight.arrAirport)",
            flight: "\(flight.carrier) \(flight.flightNo)".trimmingCharacters(in: .whitespaces),
            gate: flight.gate, next: next,
            delayMin: (flight.delayMin ?? 0) > 0 ? flight.delayMin : nil,
            cancelled: flight.status == "cancelled")
    }
}

/// The lock-screen accessories (5c-3).
enum AccessoryModel {
    /// The countdown ring fills over the last 60 days before the trip.
    static let ringWindowDays = 60

    static func countdownRing(days: Int) -> Double {
        let left = min(max(days, 0), ringWindowDays)
        return 1 - Double(left) / Double(ringWindowDays)
    }

    /// "4–2" and the leader's name for the vote accessory; nil without two options.
    static func voteScore(_ face: VoteFace?) -> (score: String, leader: String)? {
        guard let face else { return nil }
        let (lead, other) = face.left.votes >= face.right.votes ? (face.left, face.right) : (face.right, face.left)
        let leader = face.closed ? (face.left.winner ? face.left : face.right) : lead
        let runner = leader == lead ? other : lead
        return ("\(leader.votes)–\(runner.votes)", leader.label)
    }
}

/// The leave-by side of the StandBy pair (5c-4): minutes until leave time, then the alarm.
enum LeaveByClockFace: Equatable {
    /// More than 99 minutes out: the clock time to leave.
    case at(Date)
    /// Minutes to go, for the flip digits.
    case minutes(Int)
    /// Leave time has come: the right side becomes the alarm.
    case alarm

    static func make(leaveAt: Date, now: Date) -> LeaveByClockFace {
        let seconds = leaveAt.timeIntervalSince(now)
        if seconds <= 0 { return .alarm }
        let minutes = Int((seconds / 60).rounded(.up))
        return minutes > 99 ? .at(leaveAt) : .minutes(minutes)
    }

    /// Timeline dates: every minute for the last 100 minutes before leave time and the leave time
    /// itself, then nothing (WidgetKit asks again when the snapshot changes).
    static func entryDates(leaveAt: Date, now: Date) -> [Date] {
        guard leaveAt > now else { return [now] }
        let firstMinute = max(now, leaveAt.addingTimeInterval(-100 * 60))
        var dates: [Date] = [now]
        var at = leaveAt.addingTimeInterval(-60 * floor(leaveAt.timeIntervalSince(firstMinute) / 60))
        while at < leaveAt {
            if at > now { dates.append(at) }
            at = at.addingTimeInterval(60)
        }
        dates.append(leaveAt)
        return dates
    }
}
