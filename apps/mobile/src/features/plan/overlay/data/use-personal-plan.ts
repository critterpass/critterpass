/**
 * `usePersonalPlan(plan)`: my own plan over the synced crew plan and my `personal_plan_ops` rows
 * (they reach only me, on the trip's `trip_me` stream), plus keep / drop for a clash through
 * `resolve_overlay_clash`, which queues offline like any other plan write.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import { msg } from '@lingui/core/macro';
import { useCallback, useContext, useMemo } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { useLiveRows } from '../../overview/data/live-rows';
import type { PlanData } from '../../overview/data/use-plan-data';
import { personalPlan, type PersonalOpsRow, type PersonalPlan } from '../model/personal-plan';

export const RESOLVE_OVERLAY_CLASH = defineClientCommand<{
  personal_ops_id: string;
  keep: boolean;
}>({
  name: 'resolve_overlay_clash',
  offline: true,
  summarize: (p) =>
    p.keep
      ? msg({ id: 'plan.overlay.queued.keep', message: 'Keep your own plan' })
      : msg({ id: 'plan.overlay.queued.drop', message: 'Go with the crew plan' }),
});

const ROWS_SQL = `SELECT id, ops, status FROM personal_plan_ops
  WHERE trip_id = ? AND user_id = ? ORDER BY created_at, id`;
const POIS_SQL = `SELECT id, name FROM pois WHERE id IN (
  SELECT json_extract(op.value, '$.after.poi_id') FROM personal_plan_ops p, json_each(p.ops) op
  WHERE p.trip_id = ? AND p.status = 'active')`;

export function usePersonalPlan(plan: PlanData): PersonalPlan {
  const tripId = plan.trip?.id ?? null;
  const params = tripId === null || plan.uid === null ? null : [tripId, plan.uid];
  const rows = useLiveRows<PersonalOpsRow>(ROWS_SQL, params, ['personal_plan_ops']);
  const pois = useLiveRows<{ id: string; name: string }>(
    POIS_SQL,
    tripId === null ? null : [tripId],
    ['pois', 'personal_plan_ops'],
  );
  return useMemo(
    () =>
      personalPlan({
        days: plan.days,
        items: plan.items,
        rows: rows.rows,
        uid: plan.uid ?? '',
        poiNames: new Map(pois.rows.map((row) => [row.id, row.name])),
      }),
    [plan.days, plan.items, plan.uid, rows.rows, pois.rows],
  );
}

export function useResolveClash(): (personalOpsId: string, keep: boolean) => Promise<void> {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  return useCallback(
    async (personalOpsId, keep) => {
      await commands?.send(RESOLVE_OVERLAY_CLASH, { personal_ops_id: personalOpsId, keep });
    },
    [commands],
  );
}
