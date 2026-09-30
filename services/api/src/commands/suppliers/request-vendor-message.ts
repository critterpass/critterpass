/**
 * `request_vendor_message {draft_id, trip_id, vendor, vendor_name, intent, draft_text}`: a trip
 * participant (or the guide's proposal they opened) drafts a message to a vendor. Nothing is sent.
 *
 * - With the desk's WhatsApp Business number live, the draft waits for the traveller's approval of
 *   the exact text (`approve_vendor_message`), then a person at the desk sends it.
 * - Otherwise the answer carries the text and a WhatsApp share link: the traveller sends it from
 *   their own WhatsApp, and we never claim it was sent.
 *
 * One open thread per trip, vendor and requester; a new draft there supersedes the unsent one (an
 * edit voids the earlier approval). The draft id is the app's, so a replay answers the same draft.
 */
import {
  DomainError,
  requestVendorMessagePayloadSchema,
  whatsappShareLink,
  type RequestVendorMessageResult,
  type VendorChannel,
  type VendorMessageStatus,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { deskSends, vendorEvent, type VendorDeps } from '../../suppliers/vendor-store';
import { requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';

async function requireVendor(
  tx: pg.PoolClient,
  tripId: string,
  vendor: { kind: 'provider' | 'poi'; id: string },
): Promise<void> {
  const { rowCount } =
    vendor.kind === 'provider'
      ? await tx.query(
          'SELECT 1 FROM providers WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
          [vendor.id, tripId],
        )
      : await tx.query('SELECT 1 FROM pois WHERE id = $1', [vendor.id]);
  if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'vendor' });
}

function result(
  draftId: string,
  threadId: string,
  channel: VendorChannel,
  status: VendorMessageStatus,
  body: string,
): RequestVendorMessageResult {
  return {
    draft_id: draftId,
    thread_id: threadId,
    channel,
    status,
    share: channel === 'self_send' ? { text: body, wa_link: whatsappShareLink(body) } : null,
  };
}

export function createRequestVendorMessageCommand(deps: VendorDeps) {
  return defineCommand({
    name: 'request_vendor_message',
    v: 1,
    schema: requestVendorMessagePayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireTripParticipant(tx, payload.trip_id, ctx.uid);
      await requireVendor(tx, payload.trip_id, payload.vendor);
    },
    handle: async (tx, payload, ctx): Promise<RequestVendorMessageResult> => {
      const trip = await requireTripParticipant(tx, payload.trip_id, ctx.uid);
      return asSystemRole(tx, async () => {
        const known = await tx.query<{
          thread_id: string;
          channel: VendorChannel;
          status: VendorMessageStatus;
          body: string;
          requested_by: string;
        }>(
          `SELECT m.thread_id, t.channel, m.status, m.body, t.requested_by
             FROM ops.vendor_messages m JOIN ops.vendor_threads t ON t.id = m.thread_id
            WHERE m.id = $1`,
          [payload.draft_id],
        );
        const replay = known.rows[0];
        if (replay !== undefined) {
          if (replay.requested_by !== ctx.uid)
            throw new DomainError('VALIDATION', { reason: 'draft_id' });
          return result(
            payload.draft_id,
            replay.thread_id,
            replay.channel,
            replay.status,
            replay.body,
          );
        }
        const channel: VendorChannel = (await deskSends(tx, deps))
          ? 'whatsapp_business'
          : 'self_send';
        const vendorColumn = payload.vendor.kind === 'provider' ? 'provider_id' : 'poi_id';
        const open = await tx.query<{ id: string }>(
          `SELECT id FROM ops.vendor_threads
            WHERE trip_id = $1 AND requested_by = $2 AND ${vendorColumn} = $3 AND status <> 'closed'
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [trip.id, ctx.uid, payload.vendor.id],
        );
        let threadId = open.rows[0]?.id;
        if (threadId === undefined) {
          const inserted = await tx.query<{ id: string }>(
            `INSERT INTO ops.vendor_threads (trip_id, requested_by, ${vendorColumn}, vendor_name, channel)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [trip.id, ctx.uid, payload.vendor.id, payload.vendor_name, channel],
          );
          const created = inserted.rows[0]?.id;
          if (created === undefined) throw new Error('thread insert returned no row');
          threadId = created;
        } else {
          await tx.query(
            `UPDATE ops.vendor_threads SET channel = $2, version = version + 1 WHERE id = $1`,
            [threadId, channel],
          );
          await tx.query(
            `UPDATE ops.vendor_messages SET status = 'superseded', version = version + 1
              WHERE thread_id = $1 AND direction = 'outbound' AND status IN ('draft', 'approved')`,
            [threadId],
          );
        }
        await tx.query(
          `INSERT INTO ops.vendor_messages (id, thread_id, trip_id, direction, proposed_by, intent,
             body, status)
           VALUES ($1, $2, $3, 'outbound', 'user', $4, $5, 'draft')`,
          [payload.draft_id, threadId, trip.id, payload.intent, payload.draft_text],
        );
        await vendorEvent(
          tx,
          'vendor_msg.drafted',
          { id: payload.draft_id, thread_id: threadId, trip_id: trip.id, crew_id: trip.crew_id },
          { kind: 'user', id: ctx.uid },
          { channel },
        );
        return result(payload.draft_id, threadId, channel, 'draft', payload.draft_text);
      });
    },
  });
}
