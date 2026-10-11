/**
 * The owner's pass for one booking, for either UI, from the local copy the offline bundle left in
 * `local_private` (never from the network), so it opens at the gate with no signal: the leg, its
 * title and day, the code's payload and the few fields a gate agent asks for.
 */
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { currentLeg } from '../flight-card/flight-model';
import { clock, dayDate, zoneOf } from '../format';

export interface PassField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export function useBoardingPass(bookingId: string) {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const locale = useLocale();
  const { t } = useLingui();
  const booking = wallet.all.find((item) => item.id === bookingId) ?? null;
  const entry = wallet.entries.get(bookingId);
  const leg = booking === null ? null : currentLeg(booking.segments);
  const tz = zoneOf(booking?.tz, context.trip?.tz);
  const title =
    leg === null
      ? (booking?.title ?? '')
      : `${leg.carrier} ${leg.flight_no} · ${leg.dep_airport} → ${leg.arr_airport}`;
  const fields: PassField[] = [
    {
      key: 'seat',
      label: t({ id: 'bookings.flight.seat', message: 'Seat' }),
      value: booking?.details.seat,
    },
    { key: 'gate', label: t({ id: 'bookings.flight.gate', message: 'Gate' }), value: leg?.gate },
    {
      key: 'ref',
      label: t({ id: 'bookings.card.ref', message: 'Ref' }),
      value: booking?.supplierRef,
    },
  ].flatMap((field) =>
    field.value === null || field.value === undefined || field.value === ''
      ? []
      : [{ key: field.key, label: field.label, value: field.value }],
  );
  const departs = leg?.est_dep_at ?? leg?.sched_dep_at ?? booking?.startsAt ?? null;
  const arrives = leg?.est_arr_at ?? leg?.sched_arr_at ?? booking?.endsAt ?? null;
  return {
    tripId: context.trip?.id ?? null,
    loaded: wallet.loaded,
    booking,
    leg,
    title,
    subtitle: dayDate(locale, leg?.sched_dep_at ?? booking?.startsAt, tz),
    departs: departs === null ? '' : clock(locale, departs, tz),
    arrives: arrives === null ? '' : clock(locale, arrives, tz),
    boards: leg?.boarding_at == null ? '' : clock(locale, leg.boarding_at, tz),
    payload: entry?.barcode?.payload ?? null,
    fields,
  };
}
