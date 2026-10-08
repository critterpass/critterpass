/**
 * The past-trip form over this phone's rows: a new trip, or (with `id`) one already reported,
 * which can be changed or removed. Saving a change replaces the trip; the stamp list and the
 * profile show it at once, before the queue drains.
 */
import { airportDataset } from '@cp/content/airports';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import {
  draftOf,
  monthsOpen,
  pastTripYears,
  searchCountries,
  type CountryOption,
} from './past-trip-form';
import { usePastTrips } from './past-trips';
import { PastTripView } from './past-trip-view';
import { YOU_ROUTES } from '../routes';
import { localToday } from './use-travel-history';

export function PastTripScreen({
  id,
  now = () => new Date(),
}: {
  readonly id?: string;
  readonly now?: () => Date;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const [removing, setRemoving] = useState(false);
  const today = localToday(now());
  const pastTrips = usePastTrips();
  const existing = id === undefined ? undefined : pastTrips.rows.find((row) => row.id === id);
  const options = useMemo<CountryOption[]>(
    () =>
      Object.keys(airportDataset().countries).map((code) => ({
        code,
        name: regionName(code, locale) ?? code,
      })),
    [locale],
  );
  const optionOf = (code: string | undefined) =>
    code === undefined ? null : (options.find((option) => option.code === code) ?? null);

  // Null while the field shows the chosen country's name; typing searches again.
  const [query, setQuery] = useState<string | null>(null);
  const [picked, setPicked] = useState<CountryOption | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const country = query === null ? (picked ?? optionOf(existing?.country)) : null;
  const shownYear = year ?? (existing === undefined ? null : Number(existing.month.slice(0, 4)));
  const shownMonth = month ?? (existing === undefined ? null : Number(existing.month.slice(5, 7)));
  const draft = draftOf(country?.code ?? null, shownYear, shownMonth, today);
  const unchanged =
    existing !== undefined &&
    draft !== null &&
    draft.country === existing.country &&
    `${draft.month}-01` === existing.month.slice(0, 10);

  const open = monthsOpen(shownYear, today);
  return (
    <>
      <PastTripView
        editing={existing !== undefined}
        query={query ?? country?.name ?? ''}
        onQuery={setQuery}
        results={query === null ? [] : searchCountries(options, query)}
        onCountry={(option) => {
          setPicked(option);
          setQuery(null);
          Keyboard.dismiss();
        }}
        years={pastTripYears(today)}
        year={shownYear}
        onYear={(next) => {
          setYear(next);
          if (shownMonth !== null && !monthsOpen(next, today).has(shownMonth)) setMonth(null);
        }}
        monthsOpen={open}
        month={shownMonth !== null && open.has(shownMonth) ? shownMonth : null}
        onMonth={setMonth}
        canSave={draft !== null && !unchanged}
        onSave={() => {
          if (draft === null) return;
          if (existing !== undefined) pastTrips.remove(existing.id);
          pastTrips.add(draft);
          goBackOr(YOU_ROUTES.stamps);
        }}
        {...(existing === undefined
          ? {}
          : {
              onRemove: () => setRemoving(true),
            })}
        onBack={() => goBackOr(YOU_ROUTES.stamps)}
      />
      {removing && existing !== undefined ? (
        <ConfirmSheet
          title={t({ id: 'you.pastTrip.removeTitle', message: 'Remove this trip?' })}
          consequences={[
            t({
              id: 'you.pastTrip.removeLine',
              message: 'Its stamp leaves your passport. You can add the trip again later.',
            }),
          ]}
          confirmLabel={t({ id: 'you.pastTrip.removeConfirm', message: 'Remove' })}
          mode="button"
          onCancel={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false);
            pastTrips.remove(existing.id);
            goBackOr(YOU_ROUTES.stamps);
          }}
          testID="you-past-trip-remove-confirm"
        />
      ) : null}
    </>
  );
}
