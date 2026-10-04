/**
 * The plan check's inbox kind: an organiser's private ask about one member's saves, filed for that
 * member only (it needs them: yes or no) and settled when they answer from any surface. The row
 * carries ids; the app words it from the synced ask, which only the two people can read.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const CHECK_INBOX_KIND = {
  memberAsk: 'check.member_ask',
} as const;

export function memberAskResolveKey(askId: string): string {
  return `member_ask:${askId}`;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

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

for (const spec of CHECK_INBOX_KINDS) registerInboxKind(spec);
