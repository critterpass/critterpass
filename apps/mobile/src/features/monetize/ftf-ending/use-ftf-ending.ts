/**
 * A trip's free-first-trip window as the ending page reads it, from the synced grant row. Reads
 * the clock once a minute so the days left stay right on a page left open.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useMemo, useState } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { ftfEndingModel, type FtfEndingModel, type FtfGrantRow } from './ftf-ending-model';

const GRANT_SQL = `SELECT g.ends_at, g.abuse_decision, d.name AS place
  FROM ftf_grants g JOIN trips t ON t.id = g.trip_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE g.trip_id = ? LIMIT 1`;
const GRANT_TABLES = ['ftf_grants', 'trips', 'destinations'] as const;
const MINUTE_MS = 60_000;

export interface FtfEnding {
  readonly loaded: boolean;
  readonly ending: FtfEndingModel | null;
}

export function useFtfEnding(tripId: string): FtfEnding {
  const params = useMemo(() => [tripId], [tripId]);
  const rows = useLiveRows<FtfGrantRow>(GRANT_SQL, params, GRANT_TABLES);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return useMemo(
    () => ({ loaded: rows.loaded, ending: ftfEndingModel(rows.rows[0], now) }),
    [rows.loaded, rows.rows, now],
  );
}
