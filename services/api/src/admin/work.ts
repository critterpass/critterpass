/**
 * Work: one assignment model over every registered queue (`defineAdminArea({work})`). An item's
 * holder is its `ops.work_claims` row, else the source's own assignee column. `/work` lists the
 * caller's items overdue / due within 2 h / later plus how many they closed today; `/work/available`
 * lists unheld items of the queues the caller's roles open. `claim_work_item` and
 * `release_work_item` move an item between the two, mirrored into the source's assignee column.
 */
import {
  DomainError,
  OPS_TIME_ZONE,
  bucketWork,
  byDue,
  canOpenAdminArea,
  claimWorkItemPayloadSchema,
  countTone,
  releaseWorkItemPayloadSchema,
  workAvailableSchema,
  workMineSchema,
  type AdminRole,
  type AreaCount,
  type WorkItem,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminCommand,
  defineAdminRead,
  type AdminAreaDefinition,
  type AdminCommandContext,
  type AdminRegistry,
  type AdminWorkSource,
} from './registry';

const OPEN_DESK_STATUSES = ['new', 'in_progress', 'waiting_user'];

/** Concierge desk tasks: open tasks, due soonest first, assigned through `assignee_admin_id`. */
export function deskWorkSource(): AdminWorkSource {
  return {
    queue: 'desk',
    area: 'desk',
    closes: { action: 'update_concierge_task', statuses: ['done', 'cancelled'] },
    async open(tx, ids) {
      const { rows } = await tx.query<{
        id: string;
        kind: string;
        due_at: Date | null;
        assignee_admin_id: string | null;
      }>(
        `SELECT id, kind, due_at, assignee_admin_id FROM ops.concierge_tasks
         WHERE status = ANY($1::text[]) AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
         ORDER BY due_at NULLS LAST, id LIMIT 500`,
        [OPEN_DESK_STATUSES, ids ?? null],
      );
      return rows.map((row) => ({
        item_id: row.id,
        title: `Desk · ${row.kind.replace(/_/g, ' ')}`,
        due_at: row.due_at,
        assignee: row.assignee_admin_id,
      }));
    },
    async assign(tx, itemId, adminUid) {
      await tx.query(
        `UPDATE ops.concierge_tasks SET assignee_admin_id = $2, version = version + 1,
           updated_at = now() WHERE id = $1`,
        [itemId, adminUid],
      );
    },
  };
}

/** The desk's work queue and badge, mounted beside the desk area by the router. */
export function deskQueueArea(): AdminAreaDefinition {
  const source = deskWorkSource();
  return defineAdminArea({
    id: 'desk-queue',
    reads: [],
    commands: [],
    work: source,
    count: { area: 'desk', run: async (tx, now) => openItemsCount(await source.open(tx), now) },
  });
}

/** A queue's badge from its open items. */
export function openItemsCount(items: readonly { due_at: Date | null }[], now: Date): AreaCount {
  return countTone(
    items.map((item) => ({ due_at: item.due_at?.toISOString() ?? null })),
    now,
  );
}

async function claims(tx: pg.PoolClient): Promise<Map<string, string>> {
  const { rows } = await tx.query<{ queue: string; item_id: string; admin_id: string }>(
    'SELECT queue, item_id, admin_id FROM ops.work_claims',
  );
  return new Map(rows.map((row) => [`${row.queue}:${row.item_id}`, row.admin_id]));
}

/** Every open item of the queues `roles` may open, with its holder. */
export async function visibleWork(
  tx: pg.PoolClient,
  sources: readonly AdminWorkSource[],
  roles: readonly AdminRole[],
): Promise<WorkItem[]> {
  const held = await claims(tx);
  const items: WorkItem[] = [];
  for (const source of sources) {
    if (!canOpenAdminArea(roles, source.area).ok) continue;
    for (const item of await source.open(tx)) {
      items.push({
        queue: source.queue,
        item_id: item.item_id,
        area: source.area,
        title: item.title,
        due_at: item.due_at?.toISOString() ?? null,
        holder: held.get(`${source.queue}:${item.item_id}`) ?? item.assignee,
      });
    }
  }
  return items;
}

async function doneToday(
  tx: pg.PoolClient,
  sources: readonly AdminWorkSource[],
  adminUid: string,
): Promise<number> {
  let total = 0;
  for (const { closes } of sources) {
    const { rows } = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ops.admin_audit
       WHERE admin_id = $1 AND action = $2
         AND at >= date_trunc('day', now() AT TIME ZONE $4) AT TIME ZONE $4
         AND ($3::text[] IS NULL OR detail ->> 'status' = ANY($3::text[]))`,
      [adminUid, closes.action, closes.statuses ?? null, OPS_TIME_ZONE],
    );
    total += rows[0]?.n ?? 0;
  }
  return total;
}

/** The actions of every queue, deduplicated (two sources may close through one command). */
function closingSources(sources: readonly AdminWorkSource[]): AdminWorkSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.closes.action}:${(source.closes.statuses ?? []).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceFor(
  registry: AdminRegistry,
  queue: string,
  ctx: AdminCommandContext,
): AdminWorkSource {
  const source = registry.workSources().find((entry) => entry.queue === queue);
  if (source === undefined) throw new DomainError('VALIDATION', { reason: 'unknown_queue', queue });
  const decision = canOpenAdminArea(ctx.admin.roles, source.area);
  if (!decision.ok) throw new DomainError(decision.deny, { reason: 'role' });
  return source;
}

async function currentHolder(
  tx: pg.PoolClient,
  source: AdminWorkSource,
  itemId: string,
): Promise<string | null> {
  const [item] = await source.open(tx, [itemId]);
  if (item === undefined) throw new DomainError('NOT_FOUND');
  const { rows } = await tx.query<{ admin_id: string }>(
    'SELECT admin_id FROM ops.work_claims WHERE queue = $1 AND item_id = $2 FOR UPDATE',
    [source.queue, itemId],
  );
  return rows[0]?.admin_id ?? item.assignee;
}

export function workArea(pool: pg.Pool, registry: () => AdminRegistry): AdminAreaDefinition {
  return defineAdminArea({
    id: 'work',
    reads: [
      defineAdminRead({
        path: '/work',
        area: 'work',
        summary: 'My claimed items: overdue, due within 2 h, later; and how many I closed today',
        response: workMineSchema,
        run: ({ admin }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const sources = registry().workSources();
            const mine = (await visibleWork(tx, sources, admin.roles)).filter(
              (item) => item.holder === admin.uid,
            );
            return {
              ...bucketWork(mine, new Date()),
              done_today: await doneToday(tx, closingSources(sources), admin.uid),
            };
          }),
      }),
      defineAdminRead({
        path: '/work/available',
        area: 'work',
        summary: 'Unclaimed items in the queues my roles open, soonest due first',
        response: workAvailableSchema,
        run: ({ admin }) =>
          withAdminReader(pool, admin.uid, async (tx) => ({
            items: byDue(
              (await visibleWork(tx, registry().workSources(), admin.roles)).filter(
                (item) => item.holder === null,
              ),
            ),
          })),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'claim_work_item',
        schema: claimWorkItemPayloadSchema,
        audit: (payload) => ({
          targetKind: payload.queue,
          targetId: payload.item_id,
          summary: `Claimed ${payload.queue} item`,
          changes: [{ field: 'holder', before: null, after: 'self' }],
        }),
        handle: async (tx, payload, ctx) => {
          const source = sourceFor(registry(), payload.queue, ctx);
          const holder = await currentHolder(tx, source, payload.item_id);
          if (holder !== null && holder !== ctx.admin.uid) {
            throw new DomainError('STATE_INVALID', { reason: 'claimed', by: holder });
          }
          await tx.query(
            `INSERT INTO ops.work_claims (queue, item_id, admin_id) VALUES ($1, $2, $3)
             ON CONFLICT (queue, item_id) DO NOTHING`,
            [payload.queue, payload.item_id, ctx.admin.uid],
          );
          await source.assign?.(tx, payload.item_id, ctx.admin.uid);
          return { queue: payload.queue, item_id: payload.item_id, holder: ctx.admin.uid };
        },
      }),
      defineAdminCommand({
        name: 'release_work_item',
        schema: releaseWorkItemPayloadSchema,
        audit: (payload) => ({
          targetKind: payload.queue,
          targetId: payload.item_id,
          summary: `Released ${payload.queue} item`,
          changes: [{ field: 'holder', before: 'self', after: null }],
        }),
        handle: async (tx, payload, ctx) => {
          const source = sourceFor(registry(), payload.queue, ctx);
          const holder = await currentHolder(tx, source, payload.item_id);
          if (holder !== ctx.admin.uid) {
            throw new DomainError('STATE_INVALID', { reason: 'not_holder', by: holder });
          }
          await tx.query('DELETE FROM ops.work_claims WHERE queue = $1 AND item_id = $2', [
            payload.queue,
            payload.item_id,
          ]);
          await source.assign?.(tx, payload.item_id, null);
          return { queue: payload.queue, item_id: payload.item_id, holder: null };
        },
      }),
    ],
  });
}
