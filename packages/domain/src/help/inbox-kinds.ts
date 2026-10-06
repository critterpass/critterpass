/**
 * The help centre's inbox kind: the fix a traveller's report asked for has shipped. The item
 * carries the ticket number and the version only; the app words the card.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const HELP_INBOX_KIND = {
  fixShipped: 'feedback.fix_shipped',
} as const;

export const HELP_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: HELP_INBOX_KIND.fixShipped,
    event: 'feedback.fix_shipped',
    source: 'system',
    needsYou: false,
  },
];

for (const spec of HELP_INBOX_KINDS) registerInboxKind(spec);
