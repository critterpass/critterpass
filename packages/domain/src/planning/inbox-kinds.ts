/**
 * Planning's inbox kinds. The plan check's ask: an organiser's private ask about one member's
 * saves, filed for that member only (it needs them: yes or no) and settled when they answer from
 * any surface; the row carries ids, and the app words it from the synced ask, which only the two
 * people can read. Placed ideas: the guide finished placing the ideas of the person who asked, and
 * their review is waiting; settled once that change set is sent, applied or overtaken.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const CHECK_INBOX_KIND = {
  memberAsk: 'check.member_ask',
} as const;

export function memberAskResolveKey(askId: string): string {
  return `member_ask:${askId}`;
}

export const IDEAS_INBOX_KIND = {
  placed: 'ideas.placed',
} as const;

export function ideasPlacedResolveKey(changeSetId: string): string {
  return `ideas_placed:${changeSetId}`;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const placedKeys = (payload: Readonly<Record<string, unknown>>): readonly string[] => {
  const id = text(payload['change_set_id']);
  return id === null ? [] : [ideasPlacedResolveKey(id)];
};

export const CHECK_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: CHECK_INBOX_KIND.memberAsk,
    event: 'check.member_asked',
    source: 'crew',
    needsYou: true,
    resolvedBy: [
      {
        event: 'check.member_ask_answered',
        keys: (payload) => {
          const id = text(payload['ask_id']);
          return id === null ? [] : [memberAskResolveKey(id)];
        },
      },
    ],
  },
];

export const IDEAS_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: IDEAS_INBOX_KIND.placed,
    event: 'ideas.placed',
    source: 'guide',
    needsYou: true,
    resolvedBy: [
      { event: 'change_set.proposed', keys: placedKeys },
      { event: 'change_set.applied', keys: placedKeys },
      { event: 'change_set.stale', keys: placedKeys },
    ],
  },
];

for (const spec of [...CHECK_INBOX_KINDS, ...IDEAS_INBOX_KINDS]) registerInboxKind(spec);
