/**
 * The driver's reply on review changes, for a change set a driver's link proposed: found among the
 * trip's links; nothing while it loads or when the change set is not a driver's. A quote from a
 * driver on the trip's shortlist can be put to the crew as the terms of picking him.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';

import { quoteTerms } from '../pick/crew-pick';
import { useDriverShares } from '../share/data';
import { driversRoute } from '../shared/routes';
import { DriverReplyCard } from './driver-reply-card';

interface ChangesetRowLike {
  readonly id: string;
  readonly trip_id: string;
  readonly author_kind: string | null;
}

export function DriverReply({ tripId, changesetId }: { tripId: string; changesetId: string }) {
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const { last } = useDriverShares(tripId);
  const reply = last?.replies.find((r) => r.change_set_id === changesetId) ?? null;
  const share = reply === null ? null : (last?.shares.find((s) => s.id === reply.share_id) ?? null);
  if (reply === null || share === null) return null;
  const providerId = share.provider_id ?? null;
  const driverName = share.driver_name;
  // The days his link shows, as the pick sheet's ticked days.
  const dates = plan.dayRows.flatMap((day) =>
    day.date !== null && share.day_nos.includes(day.day_no) ? [day.date] : [],
  );
  return (
    <>
      <DriverReplyCard
        driverName={share.driver_name}
        reply={reply}
        dayCount={share.day_nos.length}
        crewSize={Math.max(plan.members.length, 1)}
        locale={locale}
      />
      {providerId === null || quoteTerms(reply) === null ? null : (
        <PillButton
          variant="secondary"
          block
          label={t({ id: 'drivers.replied.pick', message: `Pick ${driverName} at this price` })}
          onPress={() =>
            router.push(
              driversRoute(tripId, 'pick', {
                provider: providerId,
                days: dates.join(','),
                quote: reply.id,
              }),
            )
          }
          testID="driver-reply-pick"
        />
      )}
    </>
  );
}

/** The review's totals, with the driver's reply above them when a driver proposed the change. */
export function withDriverReply(row: ChangesetRowLike | null, totals: ReactNode): ReactNode {
  if (row?.author_kind !== 'provider') return totals;
  return (
    <>
      <DriverReply tripId={row.trip_id} changesetId={row.id} />
      {totals}
    </>
  );
}
