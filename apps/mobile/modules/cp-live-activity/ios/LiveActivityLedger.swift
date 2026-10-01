import Foundation

/// An activity's state as the server's `report_la_state` knows it (plus `pending`, never sent).
enum LiveActivityPhase: String, Sendable {
    case pending, active, stale, ended, dismissed
}

/// Turns ActivityKit's state stream into the reports the server may act on. A dismissal is
/// final on the server (that object's activity never starts on this phone again), so only the
/// user swiping away a showing activity counts as one:
/// - an activity first seen already dismissed (the app was not running) reads as ended;
/// - dismissed after ended is the system clearing the final frame, not the user: no report;
/// - an ended or dismissed activity never reads as showing again;
/// - `pending` (a scheduled start not yet shown) is never reported.
struct LiveActivityLedger: Sendable {
    private var last: [String: LiveActivityPhase] = [:]

    /// The report for `phase`, or nil when the server should hear nothing.
    mutating func report(_ id: String, _ phase: LiveActivityPhase) -> LiveActivityPhase? {
        guard let previous = last[id] else {
            let seen: LiveActivityPhase = phase == .dismissed ? .ended : phase
            last[id] = seen
            return seen == .pending ? nil : seen
        }
        if phase == previous { return nil }
        switch phase {
        case .pending:
            return nil
        case .active, .stale:
            if previous == .ended || previous == .dismissed { return nil }
            last[id] = phase
            return phase
        case .ended:
            if previous == .dismissed { return nil }
            last[id] = .ended
            return .ended
        case .dismissed:
            last[id] = .dismissed
            return previous == .ended ? nil : .dismissed
        }
    }
}

extension Data {
    /// APNs tokens travel as lowercase hex.
    var hexToken: String { map { String(format: "%02x", $0) }.joined() }
}
