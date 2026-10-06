/**
 * The plan check's fixer routes (docs/api-contracts-planning.md, routes): Less driving (7h-3),
 * Rain and crowds (7h-4) and the too-far swap for one day, worked out on the plan as the caller
 * sees it and timed on real travel (`road-timed.ts`), and FIX ALL, which gathers chosen issues
 * into one draft for the review (7h-7).
 * Participants only; anyone else gets `NOT_FOUND`. Deterministic: no model, no meter.
 */
import { withUser } from '@cp/db';
import { changeSetOpsSchema, DomainError } from '@cp/domain';
import { reorderDay, swapDay, tooFarAlternative, type FitDay } from '@cp/planner';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../../app';
import type { CommandDoorDeps } from '../../commands/_framework/doors';
import { requireCommandSession } from '../../commands/_framework/session';
import { loadCheckInput, type FixerDeps, type LoadedCheckInput } from './check-input';
import { draftCheckChangeSet } from './draft';
import { gatherOps, readIssue } from './fix-ops';
import { roadsOf, settle } from './road-timed';
import { tooFarCandidates } from './too-far-candidates';
import { reorderWire, swapsWire, tooFarWire, type WeatherSet } from './wire';

const dayParams = z.object({ id: z.uuid(), dayId: z.uuid() });
const tripParams = z.object({ id: z.uuid() });
export const fixAllBodySchema = z.strictObject({
  issue_ids: z.array(z.uuid()).min(1).max(20),
});

function dayOf(check: LoadedCheckInput, dayId: string): FitDay {
  const day = check.input.context.days.find((entry) => entry.dayId === dayId);
  if (day === undefined) throw new DomainError('NOT_FOUND', { reason: 'day' });
  return day;
}

/** The forecast watch's open weather move for the day, if any (read as the caller). */
async function weatherSet(
  tx: pg.PoolClient,
  tripId: string,
  day: FitDay,
): Promise<WeatherSet | null> {
  const ids = new Set(day.items.map((item) => item.stableId));
  const { rows } = await tx.query<{ id: string; ops: unknown }>(
    `SELECT cs.id, cs.ops FROM disruptions d JOIN change_sets cs ON cs.id = d.change_set_id
      WHERE d.trip_id = $1 AND d.kind = 'weather' AND d.status = 'open'
        AND cs.status IN ('proposed', 'voting')
      ORDER BY d.created_at DESC`,
    [tripId],
  );
  for (const row of rows) {
    const ops = changeSetOpsSchema.safeParse(row.ops);
    if (ops.success && ops.data.some((op) => ids.has(op.target))) {
      return { change_set_id: row.id, ops: ops.data.filter((op) => ids.has(op.target)) };
    }
  }
  return null;
}

export function registerFixerRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<CommandDoorDeps, 'pool' | 'sessions'>,
  fixers: FixerDeps,
): void {
  const read = <T>(headers: Headers, run: (tx: pg.PoolClient, uid: string) => Promise<T>) =>
    requireCommandSession(deps.sessions, headers).then((session) =>
      withUser(deps.pool, session.uid, 'unknown', (tx) => run(tx, session.uid)),
    );

  app.get('/v1/trips/:id/days/:dayId/reorder', async (c) => {
    const { id, dayId } = dayParams.parse(c.req.param());
    const body = await read(c.req.raw.headers, async (tx) => {
      const check = await loadCheckInput(tx, id, dayId, fixers);
      const day = dayOf(check, dayId);
      const settled = await settle(roadsOf(check, fixers), (input) => reorderDay(input, dayId));
      return reorderWire(day, check.input.context.tz, settled?.fix ?? null, settled?.checked);
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.get('/v1/trips/:id/days/:dayId/swaps', async (c) => {
    const { id, dayId } = dayParams.parse(c.req.param());
    const body = await read(c.req.raw.headers, async (tx) => {
      const check = await loadCheckInput(tx, id, dayId, fixers);
      const day = dayOf(check, dayId);
      const swaps = swapDay(check.input, dayId);
      if (swaps === null) throw new DomainError('NOT_FOUND', { reason: 'day' });
      return swapsWire(day, check.input.context.tz, swaps, await weatherSet(tx, id, day));
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.get('/v1/trips/:id/days/:dayId/too-far', async (c) => {
    const { id, dayId } = dayParams.parse(c.req.param());
    const body = await read(c.req.raw.headers, async (tx) => {
      const check = await loadCheckInput(tx, id, dayId, fixers);
      const day = dayOf(check, dayId);
      const { candidates, names } = await tooFarCandidates(
        tx,
        check.trip.destinationId,
        day,
        check.trip.id,
      );
      const settled = await settle(
        roadsOf(check, fixers),
        (input) => {
          const alternative = tooFarAlternative(input, dayId, candidates);
          return alternative === null ? null : { ...alternative, ops: [alternative.op] };
        },
        (swap) => {
          const point = candidates.find((entry) => entry.poiId === swap.poiId)?.point;
          return point === undefined ? undefined : new Map([[swap.stableId, point]]);
        },
      );
      return tooFarWire(
        settled?.fix ?? null,
        new Map([...check.names, ...names]),
        settled?.checked,
      );
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.post('/v1/trips/:id/check/fix-all', async (c) => {
    const { id } = tripParams.parse(c.req.param());
    const { issue_ids: issueIds } = fixAllBodySchema.parse(await c.req.json());
    const body = await read(c.req.raw.headers, async (tx, uid) => {
      const check = await loadCheckInput(tx, id, undefined, fixers);
      const issues = [];
      for (const issueId of new Set(issueIds)) {
        const issue = await readIssue(tx, issueId);
        if (issue.trip_id !== id) throw new DomainError('NOT_FOUND', { reason: 'issue' });
        if (issue.version_id !== check.trip.versionId) {
          throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
        }
        issues.push(issue);
      }
      const ops = await gatherOps(tx, issues, check, roadsOf(check, fixers));
      if (ops.length === 0) throw new DomainError('STATE_INVALID', { reason: 'no_fix' });
      return { change_set_id: await draftCheckChangeSet(tx, { tripId: id, uid, ops }) };
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
