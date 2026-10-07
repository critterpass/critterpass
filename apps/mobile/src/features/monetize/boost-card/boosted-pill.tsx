/**
 * The BOOSTED pill in the crew chat's header (4c-1): on while the server's entitlement row for the
 * crew's current trip says the boost is on, and gone the moment it is not.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { StatusChip } from '@/ui/chips/StatusChip';

/** The trip the chat is about: the one under way, else the next, else the one being planned. */
export const CREW_BOOSTED_SQL = `SELECT e.boost_active FROM trips t
  LEFT JOIN trip_entitlements e ON e.trip_id = t.id
  WHERE t.crew_id = ? AND t.phase IN ('in', 'pre', 'planning')
  ORDER BY (t.phase = 'in') DESC, (t.phase = 'pre') DESC, t.created_at DESC LIMIT 1`;
const TABLES = ['trips', 'trip_entitlements'];

export function BoostedPill({ crewId }: { readonly crewId: string }) {
  const { t } = useLingui();
  const locale = useLocale();
  const key = useMemo(() => [crewId], [crewId]);
  const row = useLiveRows<{ boost_active: number | null }>(CREW_BOOSTED_SQL, key, TABLES).rows[0];
  if (row?.boost_active !== 1) return null;
  return (
    <StatusChip
      status="boost"
      label={upper(t({ id: 'monetize.card.boostedPill', message: 'Boosted' }), locale)}
      testID="chat-boosted"
    />
  );
}
