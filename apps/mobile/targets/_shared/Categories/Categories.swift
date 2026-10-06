// Generated from packages/domain `NOTIFICATION_CATEGORY_SPECS` by
// packages/domain/scripts/gen-categories-swift.ts. Do not edit by hand.

import Foundation

struct CPNotificationActionSpec: Hashable, Sendable {
    let id: String
    let title: String
    let foreground: Bool
    let authenticationRequired: Bool
    let destructive: Bool
    let textInput: Bool
    let command: String?
    let scope: String?
}

struct CPNotificationCategorySpec: Hashable, Sendable {
    let id: String
    let poster: Bool
    let actions: [CPNotificationActionSpec]
}

enum CPNotificationCategories {
    static let voteActions = 3

    static let all: [CPNotificationCategorySpec] = [
        CPNotificationCategorySpec(id: "cp.vote", poster: true, actions: [
            CPNotificationActionSpec(
                id: "VOTE_1", title: "Option 1",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "cast_ballot", scope: "ballot"),
            CPNotificationActionSpec(
                id: "VOTE_2", title: "Option 2",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "cast_ballot", scope: "ballot"),
            CPNotificationActionSpec(
                id: "VOTE_3", title: "Option 3",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "cast_ballot", scope: "ballot"),
            CPNotificationActionSpec(
                id: "OPEN", title: "Open",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.changeset", poster: false, actions: [
            CPNotificationActionSpec(
                id: "APPROVE", title: "Yes",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "approve_changeset", scope: "changeset"),
            CPNotificationActionSpec(
                id: "DECLINE", title: "No",
                foreground: false, authenticationRequired: false,
                destructive: true, textInput: false,
                command: "approve_changeset", scope: "changeset"),
            CPNotificationActionSpec(
                id: "UNDO", title: "Undo",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "undo_guide_action", scope: "changeset"),
        ]),
        CPNotificationCategorySpec(id: "cp.disruption", poster: false, actions: [
            CPNotificationActionSpec(
                id: "APPROVE", title: "Do it",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "decide_disruption_action", scope: "ballot"),
            CPNotificationActionSpec(
                id: "OPEN", title: "Open",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.leaveby", poster: false, actions: [
            CPNotificationActionSpec(
                id: "IM_UP", title: "I'm up",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "set_readiness", scope: "readiness"),
            CPNotificationActionSpec(
                id: "SNOOZE", title: "Snooze",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "snooze_leave_by", scope: "readiness"),
            CPNotificationActionSpec(
                id: "LATE_10", title: "10 min late",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "report_running_late", scope: "trip_day"),
        ]),
        CPNotificationCategorySpec(id: "cp.sos", poster: false, actions: [
            CPNotificationActionSpec(
                id: "COMING", title: "I'm coming",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "respond_sos", scope: "sos"),
            CPNotificationActionSpec(
                id: "CALL", title: "Call",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
            CPNotificationActionSpec(
                id: "OPEN", title: "Open",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.money", poster: false, actions: [
            CPNotificationActionSpec(
                id: "MARK_PAID", title: "Mark paid",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "mark_paid", scope: "money_mark"),
            CPNotificationActionSpec(
                id: "CONFIRM", title: "Got it",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "confirm_paid", scope: "money_mark"),
            CPNotificationActionSpec(
                id: "NUDGE", title: "Nudge",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "nudge_payment", scope: "money_nudge"),
        ]),
        CPNotificationCategorySpec(id: "cp.chat", poster: false, actions: [
            CPNotificationActionSpec(
                id: "REPLY", title: "Reply",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: true,
                command: "send_message", scope: "chat_reply"),
            CPNotificationActionSpec(
                id: "READ", title: "Mark read",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "mark_read", scope: "chat_reply"),
        ]),
        CPNotificationCategorySpec(id: "cp.rsvp", poster: true, actions: [
            CPNotificationActionSpec(
                id: "IN", title: "I'm in",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "set_rsvp", scope: "rsvp"),
            CPNotificationActionSpec(
                id: "MAYBE", title: "Maybe",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "set_rsvp", scope: "rsvp"),
            CPNotificationActionSpec(
                id: "OPEN", title: "Open",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.invite", poster: false, actions: [
            CPNotificationActionSpec(
                id: "JOIN", title: "Join",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
            CPNotificationActionSpec(
                id: "LATER", title: "Later",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "defer_invite", scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.import", poster: false, actions: [
            CPNotificationActionSpec(
                id: "ADD_ALL", title: "Add all",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "resolve_import_candidate", scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.briefing", poster: false, actions: [
            CPNotificationActionSpec(
                id: "DONE", title: "Done",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "act_briefing_item", scope: nil),
            CPNotificationActionSpec(
                id: "NUDGE", title: "Nudge",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "act_briefing_item", scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.help", poster: false, actions: [
            CPNotificationActionSpec(
                id: "STOP_SHARE", title: "Stop sharing",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "stop_help_share", scope: "sos"),
            CPNotificationActionSpec(
                id: "EXTEND_SHARE", title: "Keep sharing",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "extend_help_share", scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.memory", poster: false, actions: [
            CPNotificationActionSpec(
                id: "REACT", title: "React",
                foreground: false, authenticationRequired: false,
                destructive: false, textInput: false,
                command: "react_memory", scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.setup_ask", poster: false, actions: [
            CPNotificationActionSpec(
                id: "freed", title: "I can make it",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
            CPNotificationActionSpec(
                id: "not_movable", title: "Can't move it",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.vendor", poster: false, actions: [
            CPNotificationActionSpec(
                id: "approve", title: "Send",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
        CPNotificationCategorySpec(id: "cp.generic", poster: false, actions: [
            CPNotificationActionSpec(
                id: "OPEN", title: "Open",
                foreground: true, authenticationRequired: false,
                destructive: false, textInput: false,
                command: nil, scope: nil),
        ]),
    ]

    static func spec(_ id: String) -> CPNotificationCategorySpec? {
        all.first { $0.id == id }
    }
}
