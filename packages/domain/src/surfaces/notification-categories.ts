/**
 * The notification categories and their actions (docs/api-contracts-async.md §3.4), shared by the
 * app's registration (apps/mobile/src/data/push/categories.ts), the iOS extensions (generated
 * `targets/_shared/Categories/Categories.swift`) and Android. Every category in
 * `NOTIFICATION_CATEGORIES` has exactly one row.
 *
 * A background action (`foreground: false`) runs its `command` without unlocking or opening the
 * app; `scope` is the device action-key scope it signs with on `POST /v1/actions`, or null when the
 * command only runs on the app's own session. A foreground action opens the app's route.
 */
import type { ActionKeyScope } from '../auth/action-key-scopes';
import type { NotificationCategory } from '../notifications';

export interface NotificationActionSpec {
  /** The action identifier the OS hands back (`UNNotificationAction.identifier`). */
  readonly id: string;
  /** The button label in English; the apps localise it, and votes replace it with option names. */
  readonly title: string;
  readonly foreground: boolean;
  /** Needs the phone unlocked first. */
  readonly authenticationRequired: boolean;
  readonly destructive: boolean;
  /** A reply field (chat): the typed text becomes the command's body. */
  readonly textInput: boolean;
  readonly command: string | null;
  readonly scope: ActionKeyScope | null;
}

export interface NotificationCategorySpec {
  readonly id: NotificationCategory;
  readonly actions: readonly NotificationActionSpec[];
  /** Long-press opens the Notification Content extension's poster (vote, RSVP). */
  readonly poster: boolean;
}

/** The most vote options a notification offers as buttons; more open the app. */
export const NOTIFICATION_VOTE_ACTIONS = 3;

type ActionInput = Pick<NotificationActionSpec, 'id' | 'title'> &
  Partial<Omit<NotificationActionSpec, 'id' | 'title'>>;

const background = (
  input: ActionInput & Pick<NotificationActionSpec, 'command'>,
): NotificationActionSpec => ({
  foreground: false,
  authenticationRequired: false,
  destructive: false,
  textInput: false,
  scope: null,
  ...input,
});

const foreground = (input: ActionInput): NotificationActionSpec => ({
  foreground: true,
  authenticationRequired: false,
  destructive: false,
  textInput: false,
  command: null,
  scope: null,
  ...input,
});

const open = foreground({ id: 'OPEN', title: 'Open' });

const voteActions = Array.from({ length: NOTIFICATION_VOTE_ACTIONS }, (_, index) =>
  background({
    id: `VOTE_${index + 1}`,
    title: `Option ${index + 1}`,
    command: 'cast_ballot',
    scope: 'ballot',
  }),
);

export const NOTIFICATION_CATEGORY_SPECS: readonly NotificationCategorySpec[] = [
  { id: 'cp.vote', poster: true, actions: [...voteActions, open] },
  {
    id: 'cp.changeset',
    poster: true,
    actions: [
      background({ id: 'APPROVE', title: 'Yes', command: 'approve_changeset', scope: 'changeset' }),
      background({
        id: 'DECLINE',
        title: 'No',
        command: 'approve_changeset',
        scope: 'changeset',
        destructive: true,
      }),
      background({ id: 'UNDO', title: 'Undo', command: 'undo_guide_action', scope: 'changeset' }),
      open,
    ],
  },
  {
    id: 'cp.disruption',
    poster: false,
    actions: [
      background({
        id: 'APPROVE',
        title: 'Do it',
        command: 'decide_disruption_action',
        scope: 'ballot',
      }),
      open,
    ],
  },
  {
    id: 'cp.leaveby',
    poster: false,
    actions: [
      background({ id: 'IM_UP', title: "I'm up", command: 'set_readiness', scope: 'readiness' }),
      background({ id: 'SNOOZE', title: 'Snooze', command: 'snooze_leave_by', scope: 'readiness' }),
      background({
        id: 'LATE_10',
        title: '10 min late',
        command: 'report_running_late',
        scope: 'trip_day',
      }),
    ],
  },
  {
    id: 'cp.sos',
    poster: false,
    actions: [
      background({ id: 'COMING', title: "I'm coming", command: 'respond_sos', scope: 'sos' }),
      foreground({ id: 'CALL', title: 'Call' }),
      open,
    ],
  },
  {
    id: 'cp.money',
    poster: false,
    actions: [
      background({
        id: 'MARK_PAID',
        title: 'Mark paid',
        command: 'mark_paid',
        scope: 'money_mark',
      }),
      background({ id: 'CONFIRM', title: 'Got it', command: 'confirm_paid', scope: 'money_mark' }),
      background({ id: 'NUDGE', title: 'Nudge', command: 'nudge_payment', scope: 'money_nudge' }),
    ],
  },
  {
    id: 'cp.chat',
    poster: false,
    actions: [
      background({
        id: 'REPLY',
        title: 'Reply',
        command: 'send_message',
        scope: 'chat_reply',
        textInput: true,
      }),
      background({ id: 'READ', title: 'Mark read', command: 'mark_read', scope: 'chat_reply' }),
    ],
  },
  {
    id: 'cp.rsvp',
    poster: true,
    actions: [
      background({ id: 'IN', title: "I'm in", command: 'set_rsvp', scope: 'rsvp' }),
      background({ id: 'MAYBE', title: 'Maybe', command: 'set_rsvp', scope: 'rsvp' }),
      open,
    ],
  },
  {
    id: 'cp.invite',
    poster: false,
    actions: [
      foreground({ id: 'JOIN', title: 'Join' }),
      background({ id: 'LATER', title: 'Later', command: 'defer_invite' }),
    ],
  },
  {
    id: 'cp.import',
    poster: false,
    actions: [background({ id: 'ADD_ALL', title: 'Add all', command: 'resolve_import_candidate' })],
  },
  {
    id: 'cp.briefing',
    poster: false,
    actions: [
      background({ id: 'DONE', title: 'Done', command: 'act_briefing_item' }),
      background({ id: 'NUDGE', title: 'Nudge', command: 'act_briefing_item' }),
    ],
  },
  {
    id: 'cp.help',
    poster: false,
    actions: [
      background({
        id: 'STOP_SHARE',
        title: 'Stop sharing',
        command: 'stop_help_share',
        scope: 'sos',
      }),
      background({ id: 'EXTEND_SHARE', title: 'Keep sharing', command: 'extend_help_share' }),
    ],
  },
  {
    id: 'cp.memory',
    poster: false,
    actions: [background({ id: 'REACT', title: 'React', command: 'react_memory' })],
  },
  {
    id: 'cp.setup_ask',
    poster: false,
    actions: [
      foreground({ id: 'freed', title: 'I can make it' }),
      foreground({ id: 'not_movable', title: "Can't move it" }),
    ],
  },
  { id: 'cp.vendor', poster: false, actions: [foreground({ id: 'approve', title: 'Send' })] },
  { id: 'cp.roundup', poster: true, actions: [open] },
  { id: 'cp.generic', poster: false, actions: [open] },
];

const BY_ID = new Map(NOTIFICATION_CATEGORY_SPECS.map((spec) => [spec.id, spec]));

export function notificationCategorySpec(id: NotificationCategory): NotificationCategorySpec {
  const spec = BY_ID.get(id);
  if (spec === undefined) throw new Error(`no notification category ${id}`);
  return spec;
}

const swiftString = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const swiftOptional = (value: string | null): string =>
  value === null ? 'nil' : swiftString(value);

/** Where the iOS targets' copy of the table lives, relative to the repository root. */
export const CATEGORIES_SWIFT_FILE = 'apps/mobile/targets/_shared/Categories/Categories.swift';

export const CATEGORIES_SWIFT_HEADER = [
  '// Generated from packages/domain `NOTIFICATION_CATEGORY_SPECS` by',
  '// packages/domain/scripts/gen-categories-swift.ts. Do not edit by hand.',
].join('\n');

/**
 * `Categories.swift` for the iOS targets: the table as Foundation-only values (the extensions
 * build their `UNNotificationAction`s from it), so the content extension and the app agree on
 * every id without a hand-kept copy.
 */
export function renderCategoriesSwift(header: string = CATEGORIES_SWIFT_HEADER): string {
  const action = (spec: NotificationActionSpec): string =>
    [
      `            CPNotificationActionSpec(`,
      `                id: ${swiftString(spec.id)}, title: ${swiftString(spec.title)},`,
      `                foreground: ${spec.foreground}, authenticationRequired: ${spec.authenticationRequired},`,
      `                destructive: ${spec.destructive}, textInput: ${spec.textInput},`,
      `                command: ${swiftOptional(spec.command)}, scope: ${swiftOptional(spec.scope)}),`,
    ].join('\n');
  const category = (spec: NotificationCategorySpec): string =>
    [
      `        CPNotificationCategorySpec(id: ${swiftString(spec.id)}, poster: ${spec.poster}, actions: [`,
      ...spec.actions.map(action),
      `        ]),`,
    ].join('\n');
  return [
    header,
    '',
    'import Foundation',
    '',
    'struct CPNotificationActionSpec: Hashable, Sendable {',
    '    let id: String',
    '    let title: String',
    '    let foreground: Bool',
    '    let authenticationRequired: Bool',
    '    let destructive: Bool',
    '    let textInput: Bool',
    '    let command: String?',
    '    let scope: String?',
    '}',
    '',
    'struct CPNotificationCategorySpec: Hashable, Sendable {',
    '    let id: String',
    '    let poster: Bool',
    '    let actions: [CPNotificationActionSpec]',
    '}',
    '',
    'enum CPNotificationCategories {',
    `    static let voteActions = ${NOTIFICATION_VOTE_ACTIONS}`,
    '',
    '    static let all: [CPNotificationCategorySpec] = [',
    ...NOTIFICATION_CATEGORY_SPECS.map(category),
    '    ]',
    '',
    '    static func spec(_ id: String) -> CPNotificationCategorySpec? {',
    '        all.first { $0.id == id }',
    '    }',
    '}',
    '',
  ].join('\n');
}
