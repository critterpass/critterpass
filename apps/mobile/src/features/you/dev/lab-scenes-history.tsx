/**
 * Lab scenes for the stamps list and the past-trip form: pure views with fixed props, every
 * handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture places and ids, never shipped copy. */
import type { ReactNode } from 'react';

import { regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';

import { monthsOpen, pastTripYears, type CountryOption } from '../history/past-trip-form';
import { PastTripView } from '../history/past-trip-view';
import type { ProfileStamp } from '../history/stamp-book';
import { StampsView } from '../history/stamps-view';

const noop = () => undefined;
const TODAY = '2026-10-03';

const stamp = (over: Partial<ProfileStamp> & Pick<ProfileStamp, 'id' | 'kind' | 'title'>) => ({
  date: null,
  daysUntil: null,
  ink: null,
  tripId: null,
  ...over,
});

export const STAMP_BOOK: readonly ProfileStamp[] = [
  stamp({ id: 'h', kind: 'home', title: 'SIN' }),
  stamp({ id: 'p1', kind: 'self', title: 'PT', date: '2019-06-01' }),
  stamp({ id: 'p2', kind: 'self', title: 'JP', date: '2022-04-01' }),
  stamp({ id: 's1', kind: 'trip', title: 'Seoul', date: '2023-10-21', tripId: 't1' }),
  stamp({ id: 's2', kind: 'trip', title: 'Hà Nội', date: '2024-02-10', tripId: 't2' }),
  stamp({ id: 's3', kind: 'trip', title: 'Lisbon', date: '2024-06-03', tripId: 't3' }),
  stamp({ id: 'n', kind: 'upcoming', title: 'Bali', date: '2026-10-18', daysUntil: 15 }),
];

function Stamps({ year = null }: { readonly year?: number | null }) {
  return (
    <StampsView
      stamps={STAMP_BOOK}
      year={year}
      onYear={noop}
      onBack={noop}
      onAddPastTrip={noop}
      openerFor={(item) => (item.kind === 'home' || item.kind === 'upcoming' ? undefined : noop)}
    />
  );
}

function PastTrip({ editing }: { readonly editing: boolean }) {
  const locale = useLocale();
  const option = (code: string): CountryOption => ({
    code,
    name: regionName(code, locale) ?? code,
  });
  return (
    <PastTripView
      editing={editing}
      query={editing ? '' : 'Port'}
      onQuery={noop}
      results={editing ? [] : [option('PT'), option('PR')]}
      country={editing ? option('PT') : null}
      onCountry={noop}
      years={pastTripYears(TODAY)}
      year={editing ? 2019 : null}
      onYear={noop}
      monthsOpen={monthsOpen(editing ? 2019 : null, TODAY)}
      month={editing ? 6 : null}
      onMonth={noop}
      canSave={editing}
      onSave={noop}
      {...(editing ? { onRemove: noop } : {})}
      onBack={noop}
    />
  );
}

export const HISTORY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'stamps-all': () => <Stamps />,
  'stamps-year': () => <Stamps year={2024} />,
  'past-trip-add': () => <PastTrip editing={false} />,
  'past-trip-edit': () => <PastTrip editing />,
};
