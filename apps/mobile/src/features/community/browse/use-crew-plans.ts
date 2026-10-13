/**
 * Crew plans for a destination as state: the filter chips (one length and one order at a time),
 * the read for the chosen filters, the top match and the rest, and opening one. Either look of the
 * Crew plans page draws from it.
 */
import type { SharedPlanCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { dataOf, useSharedPlans, type BrowseFilters } from '../api';
import { communityRoutes } from '../routes';

export type FilterKey = 'short' | 'mid' | 'long' | 'newest' | 'rating';

export interface FilterChipSpec {
  readonly key: FilterKey;
  readonly label: string;
  readonly group: readonly FilterKey[];
}

const DAYS: readonly FilterKey[] = ['short', 'mid', 'long'];
const SORTS: readonly FilterKey[] = ['newest', 'rating'];

export function filtersOf(selected: ReadonlySet<FilterKey>): BrowseFilters {
  const days = selected.has('short')
    ? { daysMax: 5 }
    : selected.has('mid')
      ? { daysMin: 6, daysMax: 8 }
      : selected.has('long')
        ? { daysMin: 9 }
        : {};
  const sort = selected.has('newest') ? 'newest' : selected.has('rating') ? 'rating' : 'match';
  return { ...days, sort };
}

export function useCrewPlans(destination: string, tripId: string | null) {
  const { t } = useLingui();
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<FilterKey>>(new Set());
  const filters = useMemo(() => filtersOf(selected), [selected]);
  const { state, reload } = useSharedPlans(destination, tripId, filters);
  const page = dataOf(state);
  const toggle = (key: FilterKey, group: readonly FilterKey[]) =>
    setSelected((current) => {
      const next = new Set([...current].filter((one) => !group.includes(one)));
      if (!current.has(key)) next.add(key);
      return next;
    });
  const chips: readonly FilterChipSpec[] = [
    {
      key: 'short',
      label: t({ id: 'community.filter.short', message: 'Up to 5 days' }),
      group: DAYS,
    },
    { key: 'mid', label: t({ id: 'community.filter.mid', message: '6–8 days' }), group: DAYS },
    { key: 'long', label: t({ id: 'community.filter.long', message: '9+ days' }), group: DAYS },
    { key: 'newest', label: t({ id: 'community.filter.newest', message: 'Newest' }), group: SORTS },
    {
      key: 'rating',
      label: t({ id: 'community.filter.rating', message: 'Top rated' }),
      group: SORTS,
    },
  ];
  const plans = page?.plans ?? [];
  const pick = plans.find((plan) => plan.id === page?.pick_id) ?? null;
  const rest = plans.filter((plan) => plan.id !== pick?.id);
  const open = (plan: SharedPlanCard) => router.push(communityRoutes.plan(plan.id, tripId));
  return {
    state,
    reload,
    page,
    plans,
    pick,
    rest,
    open,
    chips,
    selected,
    toggle,
    clear: () => setSelected(new Set()),
  };
}
