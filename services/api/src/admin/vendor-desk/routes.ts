/**
 * The vendor desk console area (opens with the `desk` area): WhatsApp threads with places and the
 * three things a person at the desk does with them, each audited by the command pipeline.
 *
 * - `send_vendor_message {draft_id}`: sends the traveller's approved text, only after
 *   `assertApproved` and the byte-for-byte check in the send path (the database trigger checks it a
 *   third time).
 * - `set_vendor_contact {thread_id, phone_e164}`: the place's WhatsApp number, sealed and hashed.
 * - `propose_vendor_reply {thread_id, draft_id, draft_text}`: the desk drafts a follow-up; it goes
 *   to the traveller for approval ("Ask Maya to approve") and voids any earlier unsent draft.
 */
import {
  DomainError,
  proposeVendorReplyPayloadSchema,
  sendVendorMessagePayloadSchema,
  setVendorContactPayloadSchema,
  VENDOR_MESSAGE_SUBJECT,
  vendorDeskDetailSchema,
  vendorDeskListSchema,
  vendorDeskQuerySchema,
  type VendorDeskDetail,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { sendVendorMessage } from '../../commands/suppliers/send-vendor-message';
import { createAuditedSupplierHttp } from '../../suppliers/http';
import {
  deskHours,
  deskSends,
  noteTask,
  sealContact,
  vendorDepsFromEnv,
  vendorEvent,
  type VendorDeps,
} from '../../suppliers/vendor-store';
import { assertApproved } from '../desk';
import { withAdminReader } from '../reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from '../registry';
import { loadVendorDesk, loadVendorThread } from './queries';

export function vendorDeskArea(
  pool: pg.Pool,
  deps: VendorDeps = vendorDepsFromEnv(process.env, createAuditedSupplierHttp(pool)),
) {
  return defineAdminArea({
    id: 'vendor_desk',
    reads: [
      defineAdminRead({
        path: '/vendor-desk',
        area: 'desk',
        summary: 'WhatsApp threads with places, by what the desk owes them',
        query: vendorDeskQuerySchema,
        response: vendorDeskListSchema,
        run: async ({ admin, query }) => ({
          items: await loadVendorDesk(pool, admin.uid, query.view, new Date()),
        }),
      }),
      defineAdminRead({
        path: '/vendor-desk/{thread_id}',
        area: 'desk',
        summary: 'One thread: approved texts, replies verbatim, notes and send state',
        params: z.object({ thread_id: z.uuid() }),
        response: vendorDeskDetailSchema,
        run: async ({ admin, operators, params }): Promise<VendorDeskDetail> => {
          const context = await withAdminReader(pool, admin.uid, async (tx) => ({
            deskSends: await deskSends(tx, deps),
            hours: await deskHours(tx),
          }));
          const detail = await loadVendorThread(pool, operators, admin.uid, params.thread_id, {
            ...context,
            now: new Date(),
          });
          if (detail === null) throw new DomainError('NOT_FOUND', { reason: 'thread' });
          return detail;
        },
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'send_vendor_message',
        schema: sendVendorMessagePayloadSchema,
        audit: (payload, result: { wa_message_id: string }) => ({
          targetKind: 'vendor_message',
          targetId: payload.draft_id,
          detail: { wa_message_id: result.wa_message_id },
        }),
        handle: async (tx, payload, ctx) => {
          await assertApproved(tx, { kind: VENDOR_MESSAGE_SUBJECT, id: payload.draft_id });
          return sendVendorMessage(tx, deps, {
            draftId: payload.draft_id,
            adminUid: ctx.admin.uid,
            now: ctx.clock.serverNow,
          });
        },
      }),
      defineAdminCommand({
        name: 'set_vendor_contact',
        schema: setVendorContactPayloadSchema,
        audit: (payload) => ({ targetKind: 'vendor_thread', targetId: payload.thread_id }),
        handle: async (tx, payload, ctx) => {
          const contact = sealContact(deps, payload.phone_e164);
          const { rows } = await tx.query<{ task_id: string | null }>(
            `UPDATE ops.vendor_threads SET wa_contact_enc = $2, wa_contact_hash = $3,
               version = version + 1
             WHERE id = $1 RETURNING task_id`,
            [payload.thread_id, contact.enc, contact.hash],
          );
          if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'thread' });
          await noteTask(
            tx,
            rows[0].task_id,
            'Set the WhatsApp number',
            ctx.clock.serverNow,
            ctx.admin.uid,
          );
          return { thread_id: payload.thread_id };
        },
      }),
      defineAdminCommand({
        name: 'propose_vendor_reply',
        schema: proposeVendorReplyPayloadSchema,
        audit: (payload) => ({ targetKind: 'vendor_thread', targetId: payload.thread_id }),
        handle: async (tx, payload, ctx) => {
          const { rows } = await tx.query<{
            trip_id: string;
            task_id: string | null;
            status: string;
            requester_name: string | null;
            crew_id: string;
          }>(
            `SELECT t.trip_id, t.task_id, t.status, tr.crew_id,
                    coalesce(u.display_name, u.username) AS requester_name
               FROM ops.vendor_threads t JOIN trips tr ON tr.id = t.trip_id
               LEFT JOIN users u ON u.id = t.requested_by
              WHERE t.id = $1 FOR UPDATE OF t`,
            [payload.thread_id],
          );
          const thread = rows[0];
          if (thread === undefined) throw new DomainError('NOT_FOUND', { reason: 'thread' });
          if (thread.status === 'closed')
            throw new DomainError('STATE_INVALID', { reason: 'closed' });
          await tx.query(
            `UPDATE ops.vendor_messages SET status = 'superseded', version = version + 1
              WHERE thread_id = $1 AND direction = 'outbound' AND status IN ('draft', 'approved')`,
            [payload.thread_id],
          );
          await tx.query(
            `INSERT INTO ops.vendor_messages (id, thread_id, trip_id, direction, proposed_by, body,
               status)
             VALUES ($1, $2, $3, 'outbound', 'ops', $4, 'draft')`,
            [payload.draft_id, payload.thread_id, thread.trip_id, payload.draft_text],
          );
          await tx.query(
            `UPDATE ops.concierge_tasks SET status = 'waiting_user', version = version + 1
              WHERE id = $1 AND status IN ('new', 'in_progress')`,
            [thread.task_id],
          );
          await noteTask(
            tx,
            thread.task_id,
            `Draft reply sent to ${thread.requester_name ?? 'the traveller'} for approval`,
            ctx.clock.serverNow,
            ctx.admin.uid,
          );
          await vendorEvent(
            tx,
            'vendor_msg.drafted',
            {
              id: payload.draft_id,
              thread_id: payload.thread_id,
              trip_id: thread.trip_id,
              crew_id: thread.crew_id,
            },
            { kind: 'system', id: ctx.admin.uid },
            { channel: 'whatsapp_business' },
          );
          return { draft_id: payload.draft_id };
        },
      }),
    ],
  });
}
