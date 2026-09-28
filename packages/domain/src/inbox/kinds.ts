/**
 * The inbox kinds Home owns: a crewmate joined, someone opened your invite, a crewmate nudged you,
 * the guide changed the plan (with UNDO), and a fare dropped on a place the crew is weighing.
 * Later features register their own (poll votes, approvals, RSVP follow-ups, payments).
 */
import { registerInboxKind, type InboxKindSpec } from './registry';

export const INBOX_KIND = {
  memberJoined: 'crew.member_joined',
  inviteOpened: 'invite.opened',
  nudgeReceived: 'nudge.received',
  guideActionExecuted: 'guide_action.executed',
  tipPriceDrop: 'tip.price_drop',
} as const;

/** How long an unanswered nudge keeps its card on top. */
export const NUDGE_INBOX_TTL_MS = 72 * 60 * 60 * 1000;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** The key that settles a nudge card: the target doing what they were nudged about. */
export function nudgeResolveKey(targetId: string, contextKind: string, contextId: string): string {
  return `nudge:${targetId}:${contextKind}:${contextId}`;
}

export function guideActionResolveKey(actionId: string): string {
  return `guide_action:${actionId}`;
}

export const HOME_INBOX_KINDS: readonly InboxKindSpec[] = [
  { kind: INBOX_KIND.memberJoined, event: 'crew.member_joined', source: 'crew', needsYou: false },
  { kind: INBOX_KIND.inviteOpened, event: 'invite.opened', source: 'crew', needsYou: false },
  { kind: INBOX_KIND.nudgeReceived, event: 'nudge.received', source: 'crew', needsYou: true },
  {
    kind: INBOX_KIND.guideActionExecuted,
    event: 'change_set.applied',
    source: 'guide',
    needsYou: false,
    resolvedBy: [
      {
        event: 'guide_action.undone',
        keys: (payload) => {
          const id = text(payload['action_id']);
          return id === null ? [] : [guideActionResolveKey(id)];
        },
      },
    ],
  },
  { kind: INBOX_KIND.tipPriceDrop, event: 'tip.created', source: 'guide', needsYou: false },
];

for (const spec of HOME_INBOX_KINDS) registerInboxKind(spec);
