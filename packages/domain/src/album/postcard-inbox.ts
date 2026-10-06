/**
 * The postcard's inbox kinds: a crewmate sent you a postcard; a crewmate wants to mail you a
 * printed one and needs your address (settled once you save one); and, for the payer, how a
 * printed mailing went (shipped, or failed with the trip's mailing given back). Items carry ids
 * and statuses only, never an address; the app words them.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const POSTCARD_INBOX_KIND = {
  received: 'postcard.received',
  addressRequested: 'postcard.address_requested',
  mailingUpdated: 'postcard.mailing_updated',
} as const;

/** The key that settles a member's address request: them saving an address. */
export function postcardAddressResolveKey(uid: string): string {
  return `postcard_address:${uid}`;
}

export const POSTCARD_INBOX_KINDS: readonly InboxKindSpec[] = [
  { kind: POSTCARD_INBOX_KIND.received, event: 'postcard.sent', source: 'crew', needsYou: false },
  {
    kind: POSTCARD_INBOX_KIND.addressRequested,
    event: 'postcard.address_requested',
    source: 'crew',
    needsYou: true,
    resolvedBy: [
      {
        event: 'postcard.address_saved',
        keys: (payload) => {
          const uid = payload['user_id'];
          return typeof uid === 'string' && payload['saved'] === true
            ? [postcardAddressResolveKey(uid)]
            : [];
        },
      },
    ],
  },
  {
    kind: POSTCARD_INBOX_KIND.mailingUpdated,
    event: 'postcard.mailing_updated',
    source: 'system',
    needsYou: false,
  },
];

for (const spec of POSTCARD_INBOX_KINDS) registerInboxKind(spec);
