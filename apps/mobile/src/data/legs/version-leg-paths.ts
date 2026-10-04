/**
 * The road every leg of one plan version follows, for the maps that draw all its days at once
 * (7a-1 trip map, the MAP tab): the synced `plan_legs` shapes read live, keyed `from>to` (`stay` or
 * a stop's stable id). A version has one row per pair, so one map serves every day. Legs without a
 * shape are absent and draw straight.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { LngLat } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { legPath } from './day-legs';

export const VERSION_LEG_SHAPES_SQL = `SELECT from_key, to_key, shape FROM plan_legs
  WHERE version_id = ? AND shape IS NOT NULL`;
const LEGS_TABLES = ['plan_legs'];

export type LegPaths = ReadonlyMap<string, readonly LngLat[]>;

export interface LegShapeRow {
  readonly from_key: string;
  readonly to_key: string;
  readonly shape: string | null;
}

export const legPairKey = (from: string, to: string) => `${from}>${to}`;

export function legPathsByPair(rows: readonly LegShapeRow[]): LegPaths {
  const paths = new Map<string, readonly LngLat[]>();
  for (const row of rows) {
    const path = legPath(row.shape);
    if (path !== null) paths.set(legPairKey(row.from_key, row.to_key), path);
  }
  return paths;
}

export function useVersionLegPaths(versionId: string | null): LegPaths {
  const rows = useLiveRows<LegShapeRow>(
    VERSION_LEG_SHAPES_SQL,
    versionId === null ? null : [versionId],
    LEGS_TABLES,
  );
  return useMemo(() => legPathsByPair(rows.rows), [rows.rows]);
}
