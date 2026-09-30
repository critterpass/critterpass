/**
 * The asker's guide meter from synced rows: Pass+ (`user_entitlements.guide_unlimited_global`),
 * the trip's active Boost, and today's `usage_counters` row for guide answers; see ./meter-model.ts
 * for how the stream's newer numbers fold in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { GUIDE_METER_METRIC } from '@cp/domain';
import { useEffect, useState } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveQuery } from '../chat/data/live-rows';
import { guideMeter, type GuideMeter, type MeterInputs } from './meter-model';

interface Row {
  readonly unlimited: number | null;
  readonly boosted: number | null;
  readonly count: number | null;
  readonly limit_at_time: number | null;
  readonly reset_at: string | null;
}

const SQL = `WITH me AS (SELECT value AS uid FROM local_state WHERE id = '${OWNER_UID_KEY}')
SELECT
  (SELECT ue.guide_unlimited_global FROM user_entitlements ue, me WHERE ue.user_id = me.uid) AS unlimited,
  (SELECT count(*) FROM trip_boosts b WHERE b.trip_id = ?1 AND b.status = 'active') AS boosted,
  c.count, c.limit_at_time, c.reset_at
FROM (SELECT 1) one
LEFT JOIN (
  SELECT u.count, u.limit_at_time, u.reset_at FROM usage_counters u, me
   WHERE u.subject_kind = 'user' AND u.subject_id = me.uid AND u.metric = '${GUIDE_METER_METRIC}'
   ORDER BY u.started_at DESC LIMIT 1
) c ON 1 = 1`;

const TABLES = ['user_entitlements', 'trip_boosts', 'usage_counters', 'local_state'];

/** The current minute, re-rendering on each new one (the countdown). */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useGuideMeter(
  tripId: string | null,
  newer: Pick<MeterInputs, 'live' | 'spent'>,
): GuideMeter {
  const rows = useLiveQuery<Row>(SQL, [tripId], TABLES);
  const now = useMinute();
  const row = rows?.[0];
  return guideMeter(
    {
      passUnlimited: row?.unlimited === 1,
      tripBoosted: (row?.boosted ?? 0) > 0,
      counter:
        row?.count === null || row?.count === undefined || row.reset_at === null
          ? null
          : { count: row.count, limit: row.limit_at_time ?? 0, resetAt: row.reset_at },
      live: newer.live,
      spent: newer.spent,
    },
    now,
  );
}
