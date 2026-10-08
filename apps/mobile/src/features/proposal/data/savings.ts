/**
 * "Skip the Nara day and save $64": the member's personal savings, priced on the phone by the
 * same cost engine the guide's version was priced with (the synced `cost_components` and the
 * members holding a seat). Only the options the version offered are shown, and the share with
 * the chosen ones taken is the engine's number, never an estimate.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { costStateFromRows, skipOptions, type CostComponentRow } from '@cp/planner';
import { useMemo } from 'react';

import { seatHeldSql } from '@/data/trips/seat-sql';

import { useLiveRows } from './rows';

export interface Saving {
  readonly id: string;
  readonly label: string;
  /** Change to the member's share, minor units (negative). */
  readonly deltaMinor: number;
  /** Change between the rounded labels ("−$64"). */
  readonly displayDeltaMinor: number;
  readonly currency: string;
}

interface ComponentRow {
  readonly component_key: string;
  readonly kind: string;
  readonly unit: string;
  readonly member_ids: string | null;
  readonly amount_minor: number | null;
  readonly currency: string;
  readonly source: string;
  readonly seen_at: string | null;
  readonly origin: string | null;
  readonly label: string | null;
}

const COMPONENTS_SQL = `SELECT component_key, kind, unit, member_ids, amount_minor, currency, source,
    seen_at, origin, label
  FROM cost_components WHERE trip_id = ? ORDER BY component_key`;
const SEATED_SQL = `SELECT user_id FROM trip_participants WHERE trip_id = ?
  AND ${seatHeldSql()} ORDER BY user_id`;

function memberIds(value: string | null): string[] | null {
  if (value === null || value === '') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

/** The engine's skip options for `uid`, as rows; empty when the trip isn't priced. */
export function priceSavings(
  rows: readonly ComponentRow[],
  seated: readonly string[],
  uid: string,
  currency: string,
): Saving[] {
  if (rows.length === 0) return [];
  try {
    const input: CostComponentRow[] = rows.map((row) => ({
      component_key: row.component_key,
      kind: row.kind,
      unit: row.unit,
      member_ids: memberIds(row.member_ids),
      amount_minor: row.amount_minor === null ? null : String(row.amount_minor),
      currency: row.currency,
      source: row.source,
      seen_at: row.seen_at ?? new Date(0).toISOString(),
      origin: row.origin,
      label: row.label,
    }));
    const state = costStateFromRows({
      currency,
      members: seated.map((id) => ({ uid: id, origin: null })),
      rows: input,
    });
    return skipOptions(state, uid).map((option) => ({
      id: option.id,
      label: option.label,
      deltaMinor: Number(option.deltaMinor),
      displayDeltaMinor: Number(option.displayDeltaMinor),
      currency: option.currency,
    }));
  } catch {
    return [];
  }
}

/** The savings the version offered `uid`, priced now. */
export function useSavings(
  tripId: string,
  uid: string,
  offered: readonly string[],
  currency: string | null,
): readonly Saving[] {
  const components = useLiveRows<ComponentRow>(COMPONENTS_SQL, [tripId], ['cost_components']);
  const seated = useLiveRows<{ user_id: string }>(SEATED_SQL, [tripId], ['trip_participants']);
  const key = offered.join(',');
  return useMemo(() => {
    if (currency === null || key === '') return [];
    const wanted = new Set(key.split(','));
    return priceSavings(
      components.rows,
      seated.rows.map((r) => r.user_id),
      uid,
      currency,
    ).filter((s) => wanted.has(s.id));
  }, [components.rows, seated.rows, uid, currency, key]);
}
