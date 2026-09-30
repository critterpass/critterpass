/**
 * My own plan: the crew's version with my active "just me" ops laid over it (`@cp/planner`'s
 * merge). Items I changed or added are mine only (`justYou`); items I skip leave my plan; an item
 * whose crew version moved under my change clashes, and I keep mine or drop it.
 */
import { changeSetOpsSchema } from '@cp/domain';
import { mergeOverlay, type OverlayClashKind, type OverlayRow } from '@cp/planner';

import { jsonArray } from '../../overview/data/plan-rows';
import { toPlanState, type PlanDay, type PlanItem } from '../../overview/model/plan-model';

export interface PersonalOpsRow {
  readonly id: string;
  readonly ops: string | null;
  readonly status: string;
}

export interface Clash {
  readonly personalOpsId: string;
  readonly stableId: string;
  readonly kind: OverlayClashKind;
  /** My version's label. */
  readonly label: string;
}

export interface PersonalPlan {
  readonly items: readonly PlanItem[];
  readonly skipped: readonly string[];
  readonly clashes: readonly Clash[];
  readonly active: boolean;
}

export function overlayRows(rows: readonly PersonalOpsRow[]): OverlayRow[] {
  return rows.flatMap((row) => {
    const ops = changeSetOpsSchema.safeParse(jsonArray<unknown>(row.ops));
    if (!ops.success) return [];
    return [{ id: row.id, ops: ops.data, status: row.status === 'active' ? 'active' : 'dropped' }];
  });
}

export function personalPlan(input: {
  readonly days: readonly PlanDay[];
  readonly items: readonly PlanItem[];
  readonly rows: readonly PersonalOpsRow[];
  readonly uid: string;
  readonly poiNames: ReadonlyMap<string, string>;
}): PersonalPlan {
  const rows = overlayRows(input.rows);
  if (!rows.some((row) => row.status === 'active')) {
    return { items: input.items, skipped: [], clashes: [], active: false };
  }
  const merged = mergeOverlay(toPlanState(input.days, input.items), rows, input.uid);
  const group = new Map(input.items.map((item) => [item.stableId, item]));
  const items = merged.items.map((item): PlanItem => {
    const base = group.get(item.stable_id);
    const poiId = item.poi_id ?? base?.poiId ?? null;
    return {
      stableId: item.stable_id,
      dayNo: item.day_no,
      startsAt: item.starts_at ?? base?.startsAt ?? null,
      endsAt: item.ends_at ?? base?.endsAt ?? null,
      tz: item.tz ?? base?.tz ?? null,
      label:
        (poiId === null ? undefined : input.poiNames.get(poiId)) ??
        (poiId === base?.poiId ? base?.label : undefined) ??
        item.notes ??
        base?.label ??
        item.category ??
        null,
      category: item.category ?? base?.category ?? null,
      poiId,
      bookingId: item.booking_id ?? base?.bookingId ?? null,
      mustDoId: item.must_do_id ?? base?.mustDoId ?? null,
      lockedReason: base?.lockedReason ?? null,
      status: base?.status ?? null,
      byGuide: base?.byGuide ?? false,
      attendeeIds: item.attendee_ids ?? base?.attendeeIds ?? [],
      lat: base?.poiId === poiId ? (base?.lat ?? null) : null,
      lng: base?.poiId === poiId ? (base?.lng ?? null) : null,
      amountMinor: item.amount_minor ?? base?.amountMinor ?? null,
      currency: item.currency ?? base?.currency ?? null,
      costModel: item.cost_model ?? base?.costModel ?? null,
      justYou: item.just_you,
    };
  });
  const byId = new Map(items.map((item) => [item.stableId, item]));
  return {
    items: items.sort(
      (a, b) => a.dayNo - b.dayNo || (a.startsAt ?? '').localeCompare(b.startsAt ?? ''),
    ),
    skipped: merged.skipped,
    clashes: merged.clashes.map((clash) => ({
      ...clash,
      label: byId.get(clash.stableId)?.label ?? '',
    })),
    active: true,
  };
}
