/**
 * The drivers a change set picks, as synced with the trip: each one's name and the terms he was
 * shortlisted on, which a pick without a quote is voted on.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { isAssignProviderOp, priceUnitSchema, type ChangeSetOp } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import type { PickedProvider } from '@/features/drivers';

const PROVIDERS_SQL = `SELECT p.id, p.name, t.price_minor, t.currency, t.price_unit, t.included_hours
  FROM providers p LEFT JOIN provider_terms t ON t.provider_id = p.id
  WHERE p.id IN (SELECT value FROM json_each(?))`;
const PROVIDER_TABLES = ['providers', 'provider_terms'];

export interface PickedProviderRow {
  readonly id: string;
  readonly name: string | null;
  readonly price_minor: number | string | null;
  readonly currency: string | null;
  readonly price_unit: string | null;
  readonly included_hours: number | string | null;
}

export function pickedProviders(rows: readonly PickedProviderRow[]): Map<string, PickedProvider> {
  return new Map(
    rows.map((row) => {
      const unit = priceUnitSchema.safeParse(row.price_unit);
      return [
        row.id,
        {
          name: row.name,
          terms: {
            price_minor: row.price_minor === null ? null : Number(row.price_minor),
            currency: row.currency,
            price_unit: unit.success ? unit.data : null,
            included_hours: row.included_hours === null ? null : Number(row.included_hours),
          },
        },
      ];
    }),
  );
}

export function usePickedProviders(ops: readonly ChangeSetOp[]): Map<string, PickedProvider> {
  const ids = useMemo(
    () => JSON.stringify([...new Set(ops.filter(isAssignProviderOp).map((op) => op.target))]),
    [ops],
  );
  const { rows } = useLiveRows<PickedProviderRow>(PROVIDERS_SQL, [ids], PROVIDER_TABLES);
  return useMemo(() => pickedProviders(rows), [rows]);
}
