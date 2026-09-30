/**
 * The conditions a reminder can wait on (`reminders.condition.kind`), each evaluated when its timer
 * comes due: the reminder fires only if its condition still holds. Features add kinds with
 * `registerReminderCondition`; the three here are the critters' legendary window, a quiet hour at
 * a spot (3l-5 "Remind me") and the crew planning again (used by the recap).
 */
import {
  nextWindowSpan,
  toLocalWallTime,
  windowRuleSchema,
  type ReminderCondition,
  type ReminderConditionKind,
} from '@cp/domain';
import type pg from 'pg';

export interface ReminderContext {
  readonly userId: string;
  readonly now: Date;
}

export type ConditionCheck<K extends ReminderConditionKind> = (
  tx: pg.PoolClient,
  condition: Extract<ReminderCondition, { kind: K }>,
  ctx: ReminderContext,
) => Promise<boolean>;

const checks = new Map<string, ConditionCheck<ReminderConditionKind>>();

export function registerReminderCondition<K extends ReminderConditionKind>(
  kind: K,
  check: ConditionCheck<K>,
): void {
  checks.set(kind, check as unknown as ConditionCheck<ReminderConditionKind>);
}

export async function conditionHolds(
  tx: pg.PoolClient,
  condition: ReminderCondition,
  ctx: ReminderContext,
): Promise<boolean> {
  const check = checks.get(condition.kind);
  if (check === undefined) return false;
  return check(tx, condition, ctx);
}

/** A quiet hour is at or below this busyness (0–100) in the POI's forecast. */
export const QUIET_BUSYNESS_MAX = 40;

registerReminderCondition('window_active_not_found', async (tx, condition, ctx) => {
  const { rows } = await tx.query<{ rule: unknown; found: boolean }>(
    `SELECT w.rule, EXISTS (
        SELECT 1 FROM collection_entries c
         WHERE c.user_id = $2 AND c.form_id = w.form_id AND c.verification = 'verified'
      ) AS found
       FROM legendary_windows w WHERE w.id = $1`,
    [condition.window_id, ctx.userId],
  );
  const row = rows[0];
  if (row === undefined || row.found) return false;
  const rule = windowRuleSchema.safeParse(row.rule);
  if (!rule.success) return false;
  const today = toLocalWallTime(ctx.now, condition.tz).date;
  return nextWindowSpan(rule.data, today)?.start === condition.window_start;
});

registerReminderCondition('quiet_window', async (tx, condition) => {
  const { rows } = await tx.query<{ busyness: number | null }>(
    `SELECT f.hourly[extract(hour FROM $2::timestamptz AT TIME ZONE coalesce(d.tz, 'UTC'))::int + 1]
              AS busyness
       FROM pois p
       JOIN destinations d ON d.id = p.destination_id
       JOIN crowd_forecasts f ON f.poi_id = p.id
        AND f.dow = extract(dow FROM $2::timestamptz AT TIME ZONE coalesce(d.tz, 'UTC'))::int
      WHERE p.id = $1`,
    [condition.poi_id, condition.at],
  );
  const busyness = rows[0]?.busyness;
  return busyness !== null && busyness !== undefined && busyness <= QUIET_BUSYNESS_MAX;
});

registerReminderCondition('crew_planning_again', async (tx, condition) => {
  const { rows } = await tx.query(
    `SELECT 1 FROM trips WHERE crew_id = $1 AND created_at > $2 AND status <> 'cancelled' LIMIT 1`,
    [condition.crew_id, condition.since],
  );
  return rows.length > 0;
});
