/**
 * Season review area (content role): each destination's month curves and the season review queue
 * (web-research candidates and edited drafts), read as `admin_reader`. Approving a curve is
 * `upsert_season_editorial` with `approve`; an event is approved or rejected by
 * `review_season_event`. Both handlers live with the season data and write their own audit row.
 */
import {
  effectiveAdminRoles,
  isEstimatedSeasonSource,
  reviewSeasonEventInputSchema,
  seasonReviewCurvesSchema,
  seasonReviewEventsSchema,
  seasonReviewQuerySchema,
  seasonReviewSummarySchema,
  upsertSeasonEditorialInputSchema,
  type PolicyActor,
  type SeasonReviewCurve,
  type SeasonReviewEvent,
  type SeasonReviewMonth,
} from '@cp/domain';
import type pg from 'pg';

import { handleReviewSeasonEvent, handleUpsertSeasonEditorial } from '../travel-data/season-admin';
import { withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminCommand,
  defineAdminRead,
  type AdminIdentity,
} from './registry';

/** The most approved events one read returns (soonest first); the pending queue is never capped. */
const APPROVED_EVENTS_LIMIT = 200;

function seasonActor(admin: AdminIdentity): PolicyActor {
  return {
    uid: admin.uid,
    isAnonymous: false,
    roles: effectiveAdminRoles(admin.roles),
    via: 'admin',
  };
}

type MonthRow = Omit<SeasonReviewMonth, 'estimated' | 'reviewed_at'> & {
  destination_id: string;
  destination_name: string;
  reviewed_at: Date | null;
};

function toCurves(rows: readonly MonthRow[]): SeasonReviewCurve[] {
  const curves = new Map<string, SeasonReviewCurve & { months: SeasonReviewMonth[] }>();
  for (const { destination_id, destination_name, reviewed_at, ...month } of rows) {
    const curve = curves.get(destination_id) ?? {
      destination_id,
      destination_name,
      state: 'approved' as const,
      months: [],
    };
    curve.months.push({
      ...month,
      estimated: isEstimatedSeasonSource(month.source),
      reviewed_at: reviewed_at?.toISOString() ?? null,
    });
    if (reviewed_at === null) curve.state = 'pending';
    curves.set(destination_id, curve);
  }
  return [...curves.values()];
}

type EventRow = Omit<SeasonReviewEvent, 'queued_at' | 'reviewed_at'> & {
  queued_at: Date;
  reviewed_at: Date | null;
};

export function seasonReviewArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'season',
    reads: [
      defineAdminRead({
        path: '/season/summary',
        area: 'catalogue',
        summary: 'Season review counts: draft curves and queued events, per destination',
        response: seasonReviewSummarySchema,
        run: ({ admin }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<{
              id: string;
              name: string;
              pending_months: number;
              pending_events: number;
            }>(
              `SELECT d.id, d.name,
                  (SELECT count(*) FROM season_months m
                    WHERE m.destination_id = d.id AND m.reviewed_at IS NULL)::int AS pending_months,
                  (SELECT count(*) FROM season_events e
                    WHERE e.destination_id = d.id AND e.reviewed_at IS NULL)::int AS pending_events
                 FROM destinations d
                WHERE EXISTS (SELECT 1 FROM season_months m WHERE m.destination_id = d.id)
                   OR EXISTS (SELECT 1 FROM season_events e WHERE e.destination_id = d.id)
                ORDER BY d.name`,
            );
            return {
              pending_curves: rows.filter((row) => row.pending_months > 0).length,
              pending_events: rows.reduce((sum, row) => sum + row.pending_events, 0),
              destinations: rows,
            };
          }),
      }),
      defineAdminRead({
        path: '/season/curves',
        area: 'catalogue',
        summary: 'Month curves per destination, drafts (pending) or fully reviewed (approved)',
        query: seasonReviewQuerySchema,
        response: seasonReviewCurvesSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<MonthRow>(
              `SELECT m.destination_id, d.name AS destination_name, m.month, m.crowd_index,
                      m.price_index, m.price_index_source, m.highlight_tag, m.colour_role, m.source,
                      m.source_url, m.sourced_on::text, m.reviewed_at
                 FROM season_months m JOIN destinations d ON d.id = m.destination_id
                WHERE ($1::uuid IS NULL OR m.destination_id = $1)
                ORDER BY d.name, m.destination_id, m.month`,
              [query.destination_id ?? null],
            );
            return { items: toCurves(rows).filter((curve) => curve.state === query.state) };
          }),
      }),
      defineAdminRead({
        path: '/season/events',
        area: 'catalogue',
        summary: 'Queued season events (pending) or approved ones, soonest first',
        query: seasonReviewQuerySchema,
        response: seasonReviewEventsSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<EventRow>(
              `SELECT e.id, e.destination_id, d.name AS destination_name, e.key, e.kind, e.name,
                      e.starts_on::text, e.ends_on::text, e.confidence, e.source, e.source_url,
                      e.sourced_on::text, e.created_at AS queued_at, e.reviewed_at
                 FROM season_events e JOIN destinations d ON d.id = e.destination_id
                WHERE ($1::uuid IS NULL OR e.destination_id = $1)
                  AND (e.reviewed_at IS NULL) = ($2 = 'pending')
                ORDER BY e.starts_on, d.name, e.key
                LIMIT $3`,
              [
                query.destination_id ?? null,
                query.state,
                query.state === 'pending' ? null : APPROVED_EVENTS_LIMIT,
              ],
            );
            return {
              items: rows.map((row) => ({
                ...row,
                queued_at: row.queued_at.toISOString(),
                reviewed_at: row.reviewed_at?.toISOString() ?? null,
              })),
            };
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'upsert_season_editorial',
        schema: upsertSeasonEditorialInputSchema,
        audit: 'self',
        handle: (tx, payload, ctx) =>
          handleUpsertSeasonEditorial(tx, seasonActor(ctx.admin), payload),
      }),
      defineAdminCommand({
        name: 'review_season_event',
        schema: reviewSeasonEventInputSchema,
        audit: 'self',
        handle: (tx, payload, ctx) => handleReviewSeasonEvent(tx, seasonActor(ctx.admin), payload),
      }),
    ],
  });
}
