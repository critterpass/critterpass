import Foundation

// What the Live Activity views and intents compute from a ContentState, kept free of SwiftUI and
// ActivityKit so the host tests (targets/Package.swift) run it without a simulator. It sits in
// `_shared` because the intents run in the app's process and the views in the widget extension.

/// A member's short key in a shared ContentState: FNV-1a (32-bit, hex) of `<scope>:<uid>`, the
/// same hash packages/domain `laMemberHash` writes. A broadcast frame cannot name its viewer, so
/// the phone finds itself by hashing its own uid.
enum LAMemberHash {
    static func of(scope: String, uid: String) -> String {
        var hash: UInt32 = 0x811C_9DC5
        for unit in "\(scope):\(uid)".utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        let hex = String(hash, radix: 16)
        return String(repeating: "0", count: 8 - hex.count) + hex
    }
}

/// The crew line of the meet-up activity (5a-2): each member's dot by ETA step, the flag at the
/// right end. Members on the same step fan out above and below the line instead of covering
/// each other.
enum MeetUpLane {
    /// Steps on the line (packages/domain `LA_MEET_UP_STEPS`): 0 is the flag, 10 the far end.
    static let steps = 10

    struct Dot: Equatable {
        /// Index into the ContentState's members.
        let member: Int
        /// 0 (far end) to 1 (at the flag).
        let x: Double
        /// Rows off the line: 0 on it, then -1, 1, -2, 2 as a step fills up.
        let row: Int
    }

    static func dots(steps memberSteps: [Int]) -> [Dot] {
        var taken: [Int: Int] = [:]
        return memberSteps.enumerated().map { index, raw in
            let step = min(max(raw, 0), steps)
            let stacked = taken[step, default: 0]
            taken[step] = stacked + 1
            let row = stacked == 0 ? 0 : (stacked % 2 == 1 ? -1 : 1) * ((stacked + 1) / 2)
            return Dot(member: index, x: 1 - Double(step) / Double(steps), row: row)
        }
    }
}

/// The dwell ring of the critter-nearby activity (5a-4).
enum CritterRing {
    /// Ring steps in a ContentState (packages/domain `LA_CRITTER_RING_STEPS`).
    static let steps = 10
    static let blurStages = 3

    /// How much of the ring is filled, 0 to 1.
    static func fraction(ring: Int) -> Double {
        Double(min(max(ring, 0), steps)) / Double(steps)
    }

    /// The silhouette's blur for a stage (3 = hidden in a blur, 0 = sharp) at a drawn size.
    static func blurRadius(stage: Int, size: Double) -> Double {
        let clamped = min(max(stage, 0), blurStages)
        return size * 0.07 * Double(clamped)
    }
}

/// The tallies of the vote activity and the vote widget.
enum VoteBoard {
    /// An option's share of the votes cast, 0 to 1 (0 while nobody has voted).
    static func share(count: Int, of counts: [Int]) -> Double {
        let total = counts.reduce(0, +)
        return total > 0 ? Double(max(count, 0)) / Double(total) : 0
    }

    /// Whether this phone's member is among the voters of a broadcast frame.
    static func viewerVoted(voted: [String], pollId: String, uid: String?) -> Bool {
        guard let uid, !uid.isEmpty else { return false }
        return voted.contains(LAMemberHash.of(scope: pollId, uid: uid))
    }

    /// The counts after this phone's member votes for `optionId`, before the server's frame
    /// arrives: one more for that option, unless the member's vote is already counted.
    static func counting(
        vote optionId: String, tallies: [(optionId: String, count: Int)], alreadyVoted: Bool
    ) -> [Int] {
        tallies.map { $0.optionId == optionId && !alreadyVoted ? $0.count + 1 : $0.count }
    }
}

/// The fare line of the ride activity: "Rp 60,000–75,000", or one figure when both ends match.
enum RideFare {
    static func text(low: Double, high: Double, currency: String, locale: Locale = .current) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.locale = locale
        formatter.maximumFractionDigits = low.rounded() == low && high.rounded() == high ? 0 : 2
        let plain = NumberFormatter()
        plain.numberStyle = .decimal
        plain.locale = locale
        plain.maximumFractionDigits = formatter.maximumFractionDigits
        guard let from = formatter.string(from: NSNumber(value: low)) else { return "" }
        guard high > low, let to = plain.string(from: NSNumber(value: high)) else { return from }
        return "\(from)–\(to)"
    }
}

/// The custom URL scheme of the app variant an extension belongs to (app.config.ts `scheme`), from
/// the extension's own bundle id: every variant's extensions sit under its app id.
enum LADeepLink {
    static func scheme(bundleId: String?) -> String {
        let id = bundleId ?? ""
        if id.hasPrefix("app.critterpass.dev") { return "critterpass-dev" }
        if id.hasPrefix("app.critterpass.staging") { return "critterpass-staging" }
        return "critterpass"
    }

    /// `critterpass://<route>`: an in-app route, opened by the app's link router.
    static func url(route: String, bundleId: String? = Bundle.main.bundleIdentifier) -> URL? {
        URL(string: "\(scheme(bundleId: bundleId))://\(route)")
    }
}
