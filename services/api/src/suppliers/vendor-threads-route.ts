/**
 * `GET /v1/trips/{trip_id}/vendor-threads`: the traveller's own vendor threads on a trip, for the
 * cards "Draft ready — send?", "Sent 10:45, waiting" and "{vendor} replied: …". `ops.*` never syncs,
 * so this is the only way a message's state reaches the app; a superseded draft is left out, a
 * reply is shown verbatim with its parsed intent once the desk's parser has read it.
 */
import { withSystem, withUser } from '@cp/db';
import {
  DomainError,
  generateUuidV7,
  type VendorReplyView,
  type VendorThreadView,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

interface Row {
  thread_id: string;
  vendor_name: string;
  channel: VendorThreadView['channel'];
  thread_status: VendorThreadView['status'];
  id: string | null;
  direction: 'outbound' | 'inbound' | null;
  body: string | null;
  status: VendorThreadView['messages'][number]['status'] | null;
  at: Date | null;
  reply: VendorReplyView | null;
}

export async function loadVendorThreads(
  pool: pg.Pool,
  uid: string,
  tripId: string,
): Promise<VendorThreadView[]> {
  const member = await withUser(pool, uid, generateUuidV7(), (tx) =>
    tx.query<{ member: boolean }>('SELECT app.is_trip_member($1) AS member', [tripId]),
  );
  if (member.rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<Row>(
      `SELECT t.id AS thread_id, t.vendor_name, t.channel, t.status AS thread_status,
              m.id, m.direction, m.body, m.status, coalesce(m.sent_at, m.created_at) AS at, m.reply
         FROM ops.vendor_threads t
         LEFT JOIN ops.vendor_messages m ON m.thread_id = t.id AND m.status <> 'superseded'
        WHERE t.trip_id = $1 AND t.requested_by = $2
        ORDER BY t.updated_at DESC, t.id, m.created_at`,
      [tripId, uid],
    ),
  );
  const threads = new Map<
    string,
    VendorThreadView & { messages: VendorThreadView['messages'][number][] }
  >();
  for (const row of rows) {
    let thread = threads.get(row.thread_id);
    if (thread === undefined) {
      thread = {
        thread_id: row.thread_id,
        vendor_name: row.vendor_name,
        channel: row.channel,
        status: row.thread_status,
        messages: [],
      };
      threads.set(row.thread_id, thread);
    }
    if (row.id === null || row.direction === null || row.body === null || row.status === null) {
      continue;
    }
    thread.messages.push({
      id: row.id,
      direction: row.direction,
      body: row.body,
      status: row.status,
      at: (row.at ?? new Date()).toISOString(),
      reply: row.direction === 'inbound' ? row.reply : null,
    });
  }
  return [...threads.values()];
}

export function registerVendorThreadsRoute(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly sessions: SessionResolver },
): void {
  app.get('/v1/trips/:tripId/vendor-threads', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const tripId = c.req.param('tripId');
    if (!/^[0-9a-f-]{36}$/.test(tripId)) throw new DomainError('NOT_FOUND', { reason: 'trip' });
    c.header('Cache-Control', 'no-store');
    return c.json({ threads: await loadVendorThreads(deps.pool, session.uid, tripId) });
  });
}
