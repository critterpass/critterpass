/**
 * Lab scenes for sharing the plan with a driver (6i-1) and the driver's reply on review changes
 * (6k-1; and once the crew's vote set him, the offer to tell him on WhatsApp), over the Bali week's
 * trip map, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import {
  DriverConfirmCard,
  DriverReplyCard,
  DriverShareSheetView,
  dayLabel,
  expiryChoices,
  openedLine,
  type DriverShareStatus,
} from '@/features/drivers';
import { useLocale } from '@/lib/i18n/use-locale';

import { changesHeadline, tallyLine } from '../../review/changes-copy';
import { ChangesReviewView } from '../../review/changes-review-view';
import { ChangesTotals } from '../../review/changes-totals';
import { TripMapScene } from '../../trip-map/dev/plan-screens-scenes';
import { dayTileColour } from '../model/day-colour';

const noop = () => undefined;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAYS = [
  { dayNo: 3, date: '2026-10-14' },
  { dayNo: 4, date: '2026-10-15' },
  { dayNo: 7, date: '2026-10-18' },
];

function ShareScene({ live, status = 'idle' }: { live: boolean; status?: DriverShareStatus }) {
  const locale = useLocale();
  return (
    <>
      <TripMapScene snap="peek" />
      <DriverShareSheetView
        driverName="Made"
        onDriverName={live ? null : noop}
        url={live ? 'https://critterpass.app/t/7k2qM4xQ9pLw2vRt' : null}
        days={DAYS.map((d) => ({
          dayNo: d.dayNo,
          label: dayLabel(locale, d.date, d.dayNo),
          selected: d.dayNo !== 4,
        }))}
        onToggleDay={noop}
        expiresLabel={expiryChoices(locale, null, 14)}
        onCycleExpiry={noop}
        allowQuote
        onAllowQuote={noop}
        opened={live ? openedLine(locale, 2, '2026-10-06T03:14:00Z') : null}
        stale={false}
        status={status}
        onCreate={noop}
        onCopy={noop}
        onWhatsApp={noop}
        onRevoke={noop}
        onClose={() => router.back()}
      />
    </>
  );
}

function RepliedScene({ set = false }: { set?: boolean }) {
  const locale = useLocale();
  const row = (n: number, date: string, dayNo: number, title: string, detail: string) => ({
    key: id(n),
    dayTag: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
      .format(new Date(`${date}T12:00:00Z`))
      .toUpperCase(),
    dayColor: dayTileColour(dayNo),
    title,
    detail,
    accepted: true,
  });
  return (
    <ChangesReviewView
      state="ready"
      backLabel="Day 3 + day 7"
      onBack={noop}
      onlyYou={null}
      title={changesHeadline('driver', 2)}
      summary="Made sent a quote and suggested 2 changes."
      rows={[
        row(1, '2026-10-14', 3, 'WED 07:00 JATILUWIH', 'Go at 07:00. Tour buses arrive at 10.'),
        row(2, '2026-10-18', 7, 'SUN 22:00 BACK AT THE VILLA', 'Traffic after the kecak.'),
      ]}
      onToggle={null}
      needsYou={[]}
      totals={
        <>
          <DriverReplyCard
            driverName="Made"
            dayCount={2}
            crewSize={6}
            locale={locale}
            reply={{
              id: id(10),
              share_id: id(11),
              status: 'open',
              change_set_id: id(12),
              price_per_day_minor: 700_000,
              currency: 'IDR',
              includes: ['petrol', 'parking', 'tolls'],
              overtime_per_hour_minor: 75_000,
              included_hours: 10,
              car: 'Toyota Avanza, 6 seats',
              tips: [
                { day_no: 7, text: 'Sarongs for Uluwatu, or Rp 10k at the gate.' },
                { day_no: 3, text: 'Upper car park at Jatiluwih.' },
              ],
              created_at: '2026-10-06T03:20:00Z',
            }}
          />
          {set ? <DriverConfirmCard driverName="Made" dayCount={2} onTell={noop} /> : null}
          <ChangesTotals
            numbers={{ eachMinor: 0, currency: 'IDR', bookingsMoved: 0, mustDosTouched: 0 }}
            drivingMin={0}
          />
        </>
      }
      send={null}
      personal={null}
      vote={set ? null : { line: tallyLine(4, 6), canVote: true, onYes: noop, onNo: noop }}
      notice={null}
    />
  );
}

export const DRIVER_SHARE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'driver-share-new': () => <ShareScene live={false} />,
  'driver-share-live': () => <ShareScene live />,
  'driver-share-revoke': () => <ShareScene live status="confirm_revoke" />,
  'driver-replied': () => <RepliedScene />,
  'driver-replied-set': () => <RepliedScene set />,
};
