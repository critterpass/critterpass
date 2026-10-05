/**
 * The plan change's inbox kinds. A change put to the crew's vote needs everyone who can vote and
 * has not (not its author), until they vote or the vote closes. When the vote closes, everyone it
 * touched reads what was decided in plain words: the change went in, the plan stays as it was, or
 * the vote ran out. Rows carry ids and a short summary (what, which day, what time); the app
 * words them.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';
import { pollVoteResolveKey } from '../polls/inbox-kinds';

export const PLAN_CHANGE_INBOX_KIND = {
  voteNeeded: 'plan_change.vote_needed',
  applied: 'plan_change.applied',
  kept: 'plan_change.kept',
  ranOut: 'plan_change.ran_out',
} as const;

/** The crew chat's system line for each way a vote on a plan change ends. */
export const PLAN_CHANGE_CHAT_LINE = {
  /** One place added: the body names it, its day and its time. */
  added: 'plan_added',
  changed: 'plan_changed',
  kept: 'plan_kept',
  ranOut: 'plan_vote_ran_out',
} as const;

/** What a plan change is, short enough for an inbox row and a chat line. */
export interface PlanChangeSummary {
  /** The first accepted change's kind (`add`, `move`, `remove`, `retime`, `swap`). */
  readonly op: string;
  /** The place or stop it is about; '' when it has no name to show. */
  readonly title: string;
  /** The day it lands on, `YYYY-MM-DD`, on the trip's clock. */
  readonly date: string | null;
  /** When it starts, `HH:MM`, on the trip's clock. */
  readonly time: string | null;
  /** How many changes were accepted in all. */
  readonly count: number;
}

/** "Bà Nà Hills · 2026-10-21 07:00": the summary as a chat line's body, read back by the app. */
export function planChangeLineBody(summary: PlanChangeSummary): string {
  if (summary.count !== 1 || summary.title === '') return '';
  const when = [summary.date, summary.time].filter((part) => part !== null).join(' ');
  return when === '' ? summary.title : `${summary.title} · ${when}`;
}

/** The reverse of `planChangeLineBody`; null for a body that names nothing. */
export function parsePlanChangeLineBody(
  body: string,
): Pick<PlanChangeSummary, 'title' | 'date' | 'time'> | null {
  if (body.trim() === '') return null;
  const match = /^(.*?)(?: · (\d{4}-\d{2}-\d{2})?(?: ?(\d{2}:\d{2}))?)?$/u.exec(body.trim());
  if (match === null) return { title: body.trim(), date: null, time: null };
  return { title: (match[1] ?? '').trim(), date: match[2] ?? null, time: match[3] ?? null };
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const PLAN_CHANGE_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: PLAN_CHANGE_INBOX_KIND.voteNeeded,
    event: 'change_set.proposed',
    source: 'crew',
    needsYou: true,
    resolvedBy: [
      {
        event: 'ballot.cast',
        keys: (payload) => {
          const uid = text(payload['user_id']);
          const poll = text(payload['poll_id']);
          return uid === null || poll === null ? [] : [pollVoteResolveKey(uid, poll)];
        },
      },
    ],
  },
  {
    kind: PLAN_CHANGE_INBOX_KIND.applied,
    event: 'change_set.applied',
    source: 'crew',
    needsYou: false,
  },
  {
    kind: PLAN_CHANGE_INBOX_KIND.kept,
    event: 'change_set.rejected',
    source: 'crew',
    needsYou: false,
  },
  {
    kind: PLAN_CHANGE_INBOX_KIND.ranOut,
    event: 'change_set.expired',
    source: 'crew',
    needsYou: false,
  },
];

for (const spec of PLAN_CHANGE_INBOX_KINDS) registerInboxKind(spec);
