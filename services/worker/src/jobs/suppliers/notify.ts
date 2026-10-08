/**
 * A message to a place waiting for the traveller's yes (`vendor_draft_ready`, `cp.vendor` with
 * APPROVE): when the guide or a disruption drafted it for the desk to send, the traveller the
 * thread is kept for gets the exact text. One they wrote in the app themselves is not pushed (they
 * are looking at it), nor one only they can send from their own WhatsApp, nor one already answered
 * by the time the push is routed.
 */
import { supplierMessagesLink, VENDOR_PUSH } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

interface DraftFacts {
  readonly requested_by: string;
  readonly crew_id: string;
  readonly vendor_name: string;
  readonly body: string;
}

async function waitingDraft(tx: pg.PoolClient, routed: RoutedEvent): Promise<DraftFacts | null> {
  if (str(routed, 'channel') !== 'whatsapp_business') return null;
  const { rows } = await tx.query<DraftFacts>(
    `SELECT t.requested_by, tr.crew_id, t.vendor_name, m.body
       FROM ops.vendor_messages m
       JOIN ops.vendor_threads t ON t.id = m.thread_id
       JOIN trips tr ON tr.id = t.trip_id
      WHERE m.id = $1 AND m.thread_id = $2 AND m.status = 'draft'`,
    [str(routed, 'message_id'), str(routed, 'thread_id')],
  );
  const draft = rows[0];
  if (draft === undefined || draft.requested_by === routed.actorId) return null;
  return draft;
}

let registered = false;

export function registerVendorNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'vendor_draft_ready',
    event: 'vendor_msg.drafted',
    audience: async (tx, routed) => {
      const draft = await waitingDraft(tx, routed);
      return draft === null ? [] : [draft.requested_by];
    },
    async compose(tx, routed) {
      const draft = await waitingDraft(tx, routed);
      if (draft === null) return null;
      const tripId = str(routed, 'trip_id') ?? '';
      return {
        title: VENDOR_PUSH.draftTitle,
        body: VENDOR_PUSH.draftBody,
        vars: { vendor: draft.vendor_name, text: draft.body },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: draft.crew_id,
        tripId,
        deepLink: supplierMessagesLink(tripId),
        needsYou: true,
        ctx: {
          draft_id: str(routed, 'message_id') ?? '',
          thread_id: str(routed, 'thread_id') ?? '',
          trip_id: tripId,
        },
        collapseVars: { thread_id: str(routed, 'thread_id') ?? '' },
      };
    },
  });
}
