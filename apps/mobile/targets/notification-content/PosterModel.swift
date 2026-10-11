import Foundation

/// What a poster notification shows and offers, read from the push's `cp` block
/// (docs/api-contracts-async.md §3.1, §3.4): votes (`ctx.poll_id`, `ctx.options[{id, label,
/// critter, tone, count}]`, `voted`, `eligible`, `closes_at`), RSVPs (`ctx.proposal_id`), a change
/// that needs a yes (`ctx.change_set_id`, `diff`, `yes_count`, `needed`, `closes_at`, `voters`) and
/// the evening roundup (`ctx.lines`). Foundation only, so the host tests run it without a
/// simulator.
struct PosterContent: Equatable, Sendable {
    struct Option: Equatable, Sendable {
        let id: String
        let label: String
        /// The guide slug whose critter stands for this answer.
        var critter: String? = nil
        /// Its colour (`orange`, `green`, `blue`, `pink`, `yellow`, `cream`).
        var tone: String? = nil
        /// Votes so far when the push was sent.
        var count: Int? = nil
    }

    /// How far the vote has got when the push was sent.
    struct Turnout: Equatable, Sendable {
        var voted: Int?
        var eligible: Int?
        var closesAt: Date?
    }

    struct Change: Equatable, Sendable {
        struct Row: Equatable, Sendable {
            let label: String
            /// `HH:mm`; nil for an added stop.
            let from: String?
            /// `HH:mm`; nil for a dropped stop.
            let to: String?
        }

        struct Voter: Equatable, Sendable {
            let initial: String
            let tone: String?
        }

        let changeSetId: String?
        let rows: [Row]
        let yesCount: Int?
        let needed: Int?
        let closesAt: Date?
        let voters: [Voter]

        /// Two stops trading times: the yes reads "Yes, swap".
        var isSwap: Bool {
            rows.count == 2 && rows.allSatisfy { $0.from != nil && $0.to != nil }
                && rows[0].from == rows[1].to && rows[1].from == rows[0].to
        }
    }

    struct RoundupLine: Equatable, Sendable {
        /// The rolled-up notification's key: picks the row's icon.
        let kind: String
        let title: String
        let sub: String?
    }

    enum Kind: Equatable, Sendable {
        case vote(pollId: String, options: [Option])
        /// Without a proposal id the poster only opens the app.
        case rsvp(proposalId: String?)
        /// Yes and no go on to the app (`approve_changeset`), as they did before the poster.
        case changeset(Change)
        case roundup(subtitle: String?, lines: [RoundupLine])
    }

    /// Set on a notification this extension re-posted with its answer, so reopening it shows the
    /// stamp instead of the buttons.
    static let stampKey = "cp_stamp"

    let kind: Kind
    let title: String
    let body: String
    /// The answer already given: an option id for a vote, `in` or `maybe` for an RSVP.
    let stamped: String?
    var turnout = Turnout()

    init?(category: String, title: String, body: String, userInfo: [AnyHashable: Any]) {
        let cp = userInfo["cp"] as? [String: Any]
        let ctx = cp?["ctx"] as? [String: Any]
        switch category {
        case "cp.vote":
            guard let pollId = ctx?["poll_id"] as? String, !pollId.isEmpty else { return nil }
            let options = (ctx?["options"] as? [[String: Any]] ?? []).compactMap { raw -> Option? in
                guard let id = raw["id"] as? String, let label = raw["label"] as? String else {
                    return nil
                }
                return Option(
                    id: id, label: label, critter: raw["critter"] as? String,
                    tone: raw["tone"] as? String, count: Self.int(raw["count"]))
            }
            kind = .vote(pollId: pollId, options: options)
            turnout = Turnout(
                voted: Self.int(ctx?["voted"]), eligible: Self.int(ctx?["eligible"]),
                closesAt: Self.date(ctx?["closes_at"]))
        case "cp.rsvp":
            kind = .rsvp(proposalId: (ctx?["proposal_id"] as? String).flatMap { $0.isEmpty ? nil : $0 })
        case "cp.changeset":
            let rows = (ctx?["diff"] as? [[String: Any]] ?? []).compactMap { raw -> Change.Row? in
                guard let label = raw["label"] as? String else { return nil }
                return Change.Row(label: label, from: raw["from"] as? String, to: raw["to"] as? String)
            }
            let voters = (ctx?["voters"] as? [[String: Any]] ?? []).compactMap { raw -> Change.Voter? in
                guard let initial = raw["initial"] as? String, !initial.isEmpty else { return nil }
                return Change.Voter(initial: initial, tone: raw["tone"] as? String)
            }
            kind = .changeset(Change(
                changeSetId: ctx?["change_set_id"] as? String, rows: rows,
                yesCount: Self.int(ctx?["yes_count"]), needed: Self.int(ctx?["needed"]),
                closesAt: Self.date(ctx?["closes_at"]), voters: voters))
        case "cp.roundup":
            let lines = (ctx?["lines"] as? [[String: Any]] ?? []).compactMap { raw -> RoundupLine? in
                guard let title = raw["title"] as? String else { return nil }
                return RoundupLine(
                    kind: raw["kind"] as? String ?? "", title: title, sub: raw["sub"] as? String)
            }
            kind = .roundup(subtitle: ctx?["subtitle"] as? String, lines: lines)
        default:
            return nil
        }
        self.title = title
        self.body = body
        stamped = userInfo[Self.stampKey] as? String
    }

    private static func int(_ value: Any?) -> Int? {
        (value as? NSNumber)?.intValue
    }

    /// A unix-seconds field.
    private static func date(_ value: Any?) -> Date? {
        (value as? NSNumber).map { Date(timeIntervalSince1970: $0.doubleValue) }
    }

    var options: [Option] {
        if case .vote(_, let options) = kind { return options }
        return []
    }

    /// The command a background action runs, or nil for OPEN and unknown ids.
    func answer(for actionId: String) -> PosterAnswer? {
        switch kind {
        case .vote(let pollId, let options):
            guard actionId.hasPrefix("VOTE_"), let number = Int(actionId.dropFirst(5)),
                  number >= 1, number <= min(options.count, CPNotificationCategories.voteActions)
            else { return nil }
            return .vote(pollId: pollId, optionId: options[number - 1].id)
        case .rsvp(let proposalId):
            guard let proposalId else { return nil }
            switch actionId {
            case "IN": return .rsvp(proposalId: proposalId, status: "in")
            case "MAYBE": return .rsvp(proposalId: proposalId, status: "maybe")
            default: return nil
            }
        case .changeset, .roundup:
            return nil
        }
    }

    /// The buttons under the poster, ids from the category table: an answered or closed poster
    /// keeps only OPEN.
    func actions(answered: Bool) -> [PosterAction] {
        let open = PosterAction(id: "OPEN", title: openTitle, foreground: true)
        guard !answered, stamped == nil else { return [open] }
        switch kind {
        case .vote(_, let options):
            let votes = options.prefix(CPNotificationCategories.voteActions).enumerated().map {
                index, option in
                PosterAction(
                    id: "VOTE_\(index + 1)", title: String(localized: "Vote \(option.label)"),
                    foreground: false)
            }
            return votes + [open]
        case .rsvp(let proposalId):
            guard proposalId != nil else { return [open] }
            return [
                PosterAction(id: "IN", title: String(localized: "I'm in"), foreground: false),
                PosterAction(id: "MAYBE", title: String(localized: "Maybe"), foreground: false),
                open,
            ]
        case .changeset(let change):
            let yes = change.isSwap ? String(localized: "Yes, swap") : String(localized: "Yes")
            return [
                PosterAction(id: "APPROVE", title: yes, foreground: false),
                PosterAction(id: "DECLINE", title: String(localized: "Not this one"), foreground: false),
                open,
            ]
        case .roundup:
            return [open]
        }
    }

    private var openTitle: String {
        switch kind {
        case .vote: return String(localized: "Open the showdown")
        case .rsvp: return String(localized: "Open the trip")
        case .changeset: return String(localized: "Open the plan")
        case .roundup: return String(localized: "Open")
        }
    }

    func label(ofOption id: String) -> String? {
        options.first { $0.id == id }?.label
    }

    /// The re-posted notification's line: the answer, then the score or the result; without an
    /// outcome the answer is queued and goes when the phone is back online.
    func stampLine(answer: PosterAnswer, outcome: PosterOutcome?) -> String {
        switch (answer, outcome) {
        case (.vote, .closed(let tallies, let winner)?),
             (.vote, .accepted(let tallies, true, let winner)?):
            let won = winner.flatMap(label(ofOption:))
            let score = scoreLine(tallies)
            return won.map { String(localized: "Vote closed: \($0) won. \(score)") }
                ?? String(localized: "Vote closed. \(score)")
        case (.vote(_, let optionId), .accepted(let tallies, _, _)?):
            let voted = label(ofOption: optionId) ?? ""
            return String(localized: "You voted \(voted). \(scoreLine(tallies))")
        case (.vote(_, let optionId), _):
            let voted = label(ofOption: optionId) ?? ""
            return String(localized: "You voted \(voted). Sending when you're back online.")
        case (.rsvp(_, let status), .accepted?):
            return status == "in" ? String(localized: "You're in.") : String(localized: "You said maybe.")
        case (.rsvp(_, let status), _):
            return status == "in"
                ? String(localized: "You're in. Sending when you're back online.")
                : String(localized: "You said maybe. Sending when you're back online.")
        }
    }

    /// "3 of 6 have voted. It closes Friday." from the push's turnout, nil without one.
    func turnoutLine(now: Date = Date(), calendar: Calendar = .current) -> String? {
        guard let voted = turnout.voted, let eligible = turnout.eligible, eligible > 0 else {
            return nil
        }
        let have = String(localized: "\(voted) of \(eligible) have voted.")
        guard let closes = turnout.closesAt, closes > now else { return have }
        let day = calendar.isDate(closes, inSameDayAs: now)
            ? closes.formatted(date: .omitted, time: .shortened)
            : closes.formatted(.dateTime.weekday(.wide))
        return "\(have) " + String(localized: "It closes \(day).")
    }

    /// "Kyoto 3 · Lisbon 1", in the poll's option order.
    func scoreLine(_ tallies: [String: Int]) -> String {
        options.map { "\($0.label) \(tallies[$0.id] ?? 0)" }.joined(separator: " · ")
    }
}

struct PosterAction: Equatable, Sendable {
    let id: String
    let title: String
    let foreground: Bool
}

enum PosterAnswer: Equatable, Sendable {
    case vote(pollId: String, optionId: String)
    case rsvp(proposalId: String, status: String)

    /// The stamp value: the option voted for, or the RSVP status.
    var value: String {
        switch self {
        case .vote(_, let optionId): return optionId
        case .rsvp(_, let status): return status
        }
    }
}

/// How the server answered a poster's command (`POST /v1/actions`).
enum PosterOutcome: Equatable, Sendable {
    /// Counted. For votes, the tallies by option id and whether this ballot closed the poll.
    case accepted(tallies: [String: Int], closed: Bool, winner: String?)
    /// The vote had already closed: the result to show instead of an error.
    case closed(tallies: [String: Int], winner: String?)
    /// Refused for another reason (key revoked, no longer a member): the poster offers OPEN.
    case refused(code: String)

    /// Reads the response body: a command outcome (`{status, result}`) on success, the wire error
    /// (`{error: {code, detail}}`) otherwise. Nil when the body is neither.
    static func parse(statusCode: Int, body: Data) -> PosterOutcome? {
        guard let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else {
            return nil
        }
        if let error = json["error"] as? [String: Any], let code = error["code"] as? String {
            let detail = error["detail"] as? [String: Any]
            if code == "VOTE_CLOSED", let result = detail?["result"] as? [String: Any] {
                return .closed(tallies: tallies(result), winner: result["winner_option_id"] as? String)
            }
            return .refused(code: code)
        }
        guard (200..<300).contains(statusCode),
              let status = json["status"] as? String, status == "applied" || status == "duplicate"
        else { return nil }
        let result = json["result"] as? [String: Any] ?? [:]
        return .accepted(
            tallies: tallies(result), closed: result["status"] as? String == "closed",
            winner: result["winner_option_id"] as? String)
    }

    private static func tallies(_ result: [String: Any]) -> [String: Int] {
        (result["option_tallies"] as? [String: Any] ?? [:]).compactMapValues { ($0 as? NSNumber)?.intValue }
    }
}
