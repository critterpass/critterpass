/**
 * Who hears about a postcard in their inbox: the crewmates it was sent to; the crewmates a payer
 * wants to mail a printed one to but who have no address yet (the card settles once they save
 * one); and the payer when their mailing shipped or failed (failed: the trip's mailing is theirs
 * to use again). Items carry ids and a status only.
 */
import {
  ensureInboxKinds,
  POSTCARD_INBOX_KIND,
  POSTCARD_INBOX_KINDS,
  postcardAddressResolveKey,
} from '@cp/domain';

import { registerInboxFanout, type FanoutEvent } from '../inbox/fanout';

const str = (event: FanoutEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

const ids = (event: FanoutEvent, key: string): readonly string[] => {
  const value = event.payload[key];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
};

/** The postcard screen in the trip's recap, opened on one postcard. */
export function postcardPath(tripId: string | null, postcardId: string | null): string | null {
  return tripId === null || postcardId === null
    ? null
    : `/recap/${tripId}/postcard?postcard_id=${postcardId}`;
}

let registered = false;

export function registerPostcardInboxFanouts(): void {
  if (registered) return;
  registered = true;
  ensureInboxKinds(POSTCARD_INBOX_KINDS);
  registerInboxFanout({
    kind: POSTCARD_INBOX_KIND.received,
    audience: (_tx, event) => Promise.resolve(ids(event, 'to_uids')),
    build: (_tx, event) => {
      const tripId = str(event, 'trip_id');
      const postcardId = str(event, 'postcard_id');
      return Promise.resolve({
        actorId: str(event, 'sender_id'),
        data: { trip_id: tripId, postcard_id: postcardId, sender_id: str(event, 'sender_id') },
        deepLink: postcardPath(tripId, postcardId),
      });
    },
  });
  registerInboxFanout({
    kind: POSTCARD_INBOX_KIND.addressRequested,
    audience: (_tx, event) => Promise.resolve(ids(event, 'user_ids')),
    build: (_tx, event, uid) => {
      const tripId = str(event, 'trip_id');
      const postcardId = str(event, 'postcard_id');
      return Promise.resolve({
        actorId: str(event, 'payer_id'),
        data: { trip_id: tripId, postcard_id: postcardId, payer_id: str(event, 'payer_id') },
        resolveKey: postcardAddressResolveKey(uid),
        deepLink: postcardPath(tripId, postcardId),
      });
    },
  });
  registerInboxFanout({
    kind: POSTCARD_INBOX_KIND.mailingUpdated,
    audience: (_tx, event) => {
      const payer = str(event, 'payer_id');
      return Promise.resolve(payer === null ? [] : [payer]);
    },
    async build(tx, event) {
      const status = str(event, 'status');
      if (status !== 'shipped' && status !== 'failed') return null;
      const tripId = str(event, 'trip_id');
      const mailingId = str(event, 'mailing_id');
      const { rows } = await tx.query<{ postcard_id: string }>(
        'SELECT postcard_id FROM postcard_mailings WHERE id = $1',
        [mailingId],
      );
      return {
        data: { trip_id: tripId, mailing_id: mailingId, status },
        deepLink: postcardPath(tripId, rows[0]?.postcard_id ?? null),
      };
    },
  });
}
