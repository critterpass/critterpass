import Foundation

/// What a vote or RSVP notification's poster shows and offers, read from the push's `cp` block
/// (docs/api-contracts-async.md §3.1: `ctx.poll_id` and `ctx.options[{id, label}]` for votes,
/// `ctx.proposal_id` for RSVPs). Foundation only, so the host tests run it without a simulator.
struct PosterContent: Equatable, Sendable {
    struct Option: Equatable, Sendable {
        let id: String
        let label: String
    }

    enum Kind: Equatable, Sendable {
        case vote(pollId: String, options: [Option])
        /// Without a proposal id the poster only opens the app.
        case rsvp(proposalId: String?)
    }

    /// Set on a notification this extension re-posted with its answer, so reopening it shows the
    /// stamp instead of the buttons.
    static let stampKey = "cp_stamp"

    let kind: Kind
    let title: String
    let body: String
    /// The answer already given: an option id for a vote, `in` or `maybe` for an RSVP.
    let stamped: String?

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
                return Option(id: id, label: label)
            }
            kind = .vote(pollId: pollId, options: options)
        case "cp.rsvp":
            kind = .rsvp(proposalId: (ctx?["proposal_id"] as? String).flatMap { $0.isEmpty ? nil : $0 })
        default:
            return nil
        }
        self.title = title
        self.body = body
        stamped = userInfo[Self.stampKey] as? String
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
        }
    }

    private var openTitle: String {
        switch kind {
        case .vote: return String(localized: "Open the showdown")
        case .rsvp: return String(localized: "Open the trip")
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
