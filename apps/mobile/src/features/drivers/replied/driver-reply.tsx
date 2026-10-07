/**
 * The driver's reply on review changes, for a change set a driver's link proposed: found among the
 * trip's links; nothing while it loads or when the change set is not a driver's. A quote from a
 * driver on the trip's shortlist can be put to the crew as the terms of picking him; once that vote
 * set him on his days, the pick gives way to telling him on WhatsApp (days, pickup pins and the
 * price agreed, written here and sent by the traveller from their own WhatsApp).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';

import { quoteTerms } from '../pick/crew-pick';
import { useDriverShares, whatsAppUrl } from '../share/data';
import { dayLabel, money } from '../shared/format';
import { driversRoute } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { useLiveRows } from '../shared/use-live-rows';
import { whatsappAsk } from '../shared/whatsapp-copy';
import {
  confirmLines,
  driverConfirmOf,
  type DriverConfirm,
  type VotedAssignment,
} from './confirm-days';
import { DriverConfirmCard } from './driver-confirm-card';
import { DriverReplyCard } from './driver-reply-card';

const VOTED_SQL = `SELECT day_date, provider_id, window_start, window_end, agreed, change_set_id
  FROM provider_assignments WHERE trip_id = ? AND provider_id = ? AND change_set_id IS NOT NULL`;
const VOTED_TABLES = ['provider_assignments'];

/** The message for the driver, opened in WhatsApp to his number (or to pick him there without one). */
function TellDriver(props: {
  tripId: string;
  providerId: string;
  driverName: string;
  confirm: DriverConfirm;
}) {
  const locale = useLocale();
  const { state } = useDrivers(props.tripId);
  const drivers = state.kind === 'ready' || state.kind === 'offline' ? state.data?.drivers : null;
  const phone = drivers?.find((d) => d.id === props.providerId)?.phone ?? null;
  const name = props.driverName;
  const lines = confirmLines(props.confirm, (date) => dayLabel(date, locale));
  const price =
    props.confirm.price === null
      ? null
      : money(props.confirm.price.minor, props.confirm.price.currency, locale);
  const text =
    price === null
      ? t({
          id: 'drivers.replied.confirmMessage',
          message: `Hi ${name}, the crew said yes. We'd like to book you for:\n${lines}\nCan you confirm?`,
        })
      : t({
          id: 'drivers.replied.confirmMessagePrice',
          message: `Hi ${name}, the crew said yes to ${price} a day. We'd like to book you for:\n${lines}\nCan you confirm?`,
        });
  return (
    <DriverConfirmCard
      driverName={name}
      dayCount={props.confirm.days.length}
      onTell={() => void Linking.openURL(whatsappAsk(phone, text) ?? whatsAppUrl(text))}
    />
  );
}

interface ChangesetRowLike {
  readonly id: string;
  readonly trip_id: string;
  readonly author_kind: string | null;
}

export function DriverReply({ tripId, changesetId }: { tripId: string; changesetId: string }) {
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const driverDays = useDriverDays(tripId);
  const { last } = useDriverShares(tripId);
  const reply = last?.replies.find((r) => r.change_set_id === changesetId) ?? null;
  const share = reply === null ? null : (last?.shares.find((s) => s.id === reply.share_id) ?? null);
  const providerId = share?.provider_id ?? null;
  const voted = useLiveRows<VotedAssignment>(
    VOTED_SQL,
    providerId === null ? null : [tripId, providerId],
    VOTED_TABLES,
  );
  if (reply === null || share === null) return null;
  const confirm =
    providerId === null ? null : driverConfirmOf(voted.rows, providerId, driverDays.days);
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
      {providerId !== null && confirm !== null ? (
        <TellDriver
          tripId={tripId}
          providerId={providerId}
          driverName={driverName}
          confirm={confirm}
        />
      ) : providerId === null || quoteTerms(reply) === null ? null : (
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
