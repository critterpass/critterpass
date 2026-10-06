import Foundation

/// Sends a poster's answer (`SignedActionSender`): straight to the server with the device action
/// key, or into the outbox under the same `op_id` when that is not possible right now.
enum PosterSender {
    enum Result: Equatable, Sendable {
        case answered(PosterOutcome)
        case queued
        /// Neither sent nor queued (no App Group container): the poster offers OPEN.
        case failed
    }

    static func send(_ answer: PosterAnswer, now: Date = Date()) async -> Result {
        let action = pendingAction(answer, now: now)
        switch await SignedActionSender.send(
            action, surface: .notificationAction, root: AppGroupContainer.url, now: now) {
        case .answered(let statusCode, let body):
            if let outcome = PosterOutcome.parse(statusCode: statusCode, body: body) {
                return .answered(outcome)
            }
            return (200..<300).contains(statusCode)
                ? .answered(.accepted(tallies: [:], closed: false, winner: nil))
                : .answered(.refused(code: "UNREADABLE"))
        case .queued: return .queued
        case .failed: return .failed
        }
    }

    static func pendingAction(_ answer: PosterAnswer, now: Date) -> PendingAction {
        switch answer {
        case .vote(let pollId, let optionId):
            return .ballot(pollId: pollId, optionId: optionId, via: .notifAction, now: now)
        case .rsvp(let proposalId, let status):
            return .rsvp(proposalId: proposalId, status: status, now: now)
        }
    }
}
