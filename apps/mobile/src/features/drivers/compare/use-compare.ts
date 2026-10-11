/**
 * Compare's state: the shortlist for the chosen days, each driver's column (his card with the
 * price read from what he shared, how many lines he has not said), the rows as data (a day price,
 * what each person pays, car and seats, languages, tolls and entry, overtime, licence), the
 * biggest risk, and the actions (ask him on WhatsApp, pick him, add another).
 */
import { compareColumn, compareRisk, type CompareCandidate, type DriverCard } from '@cp/domain';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';

import { driverCardOf, type DriversApi, type ShortlistDriver } from '../shared/api';
import { dayLabel, money } from '../shared/format';
import { askWords, isFloor, usePriceWords } from '../shared/price-text';
import { readCardFor, withReadPrice } from '../shared/read-price';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { askMessage, whatsappAsk } from '../shared/whatsapp-copy';
import { candidateOf, hoursBetween, riskLine } from './compare-model';

export type CompareCell =
  | { readonly kind: 'text'; readonly text: string; readonly tone?: 'good' | 'risk' }
  | { readonly kind: 'notSaid'; readonly ask: () => void }
  | {
      readonly kind: 'price';
      readonly price: string | null;
      /** No one price to quote: ask him, his own words under it. */
      readonly ask: (() => void) | null;
      readonly askWords: string | null;
      readonly tiers: readonly string[];
    };

export interface CompareRow {
  readonly key: string;
  readonly label: string;
  readonly cells: readonly CompareCell[];
}

const DASH = '—';

export function useCompare(tripId: string, days?: string, api?: DriversApi) {
  const locale = useLocale();
  const { t } = useLingui();
  const words = usePriceWords();
  const plan = useDriverDays(tripId);
  const { state, refresh } = useDrivers(tripId, api);
  const picked = new Set(splitDays(days));
  const chosen = plan.days.filter((d) => (picked.size === 0 ? d.gap !== null : picked.has(d.date)));
  const compareDays = chosen.map((day) => ({
    date: day.date,
    hours: day.window === null ? null : hoursBetween(day.window.start, day.window.end),
  }));
  const data = state.kind === 'ready' || state.kind === 'offline' ? state.data : null;
  const drivers = (data?.drivers ?? []).filter((driver) => driver.terms.status === 'shortlisted');
  const cards = drivers.map((driver) =>
    withReadPrice(driverCardOf(driver), readCardFor(data?.intake ?? [], driver.id)),
  );
  const candidates = drivers.map((driver, i) =>
    candidateOf(driver, cards[i] as DriverCard, compareDays, plan.people),
  );
  const currencies = new Set(candidates.map((c) => c.currency).filter((c) => c !== null));
  const toCommon = (minor: number, currency: string) =>
    currencies.size <= 1 || currency === plan.currency ? minor : null;
  const risk = compareRisk(candidates, compareDays, plan.people, toCommon);
  const columnOf = (i: number) =>
    compareColumn(candidates[i] as CompareCandidate, compareDays, plan.people);
  const header = [
    chosen.map((day) => dayLabel(day.date, locale)).join(' + '),
    t({
      id: 'drivers.compare.people',
      message: plural(plan.people, { one: '# person', other: '# people' }),
    }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  const open = (driver: ShortlistDriver, text: string) => {
    const url = whatsappAsk(driver.phone, text);
    if (url !== null) void Linking.openURL(url);
  };
  const notSaid = (d: ShortlistDriver): CompareCell => ({
    kind: 'notSaid',
    ask: () => open(d, askMessage(t, d.name, [], driverCardOf(d).overtime_minor === null)),
  });
  const text = (value: string, tone?: 'good' | 'risk'): CompareCell =>
    tone === undefined ? { kind: 'text', text: value } : { kind: 'text', text: value, tone };
  const priceCell = (d: ShortlistDriver, card: DriverCard): CompareCell => {
    const ask = askWords(card);
    return {
      kind: 'price',
      price: words.price(card),
      ask:
        ask === null
          ? null
          : () =>
              open(
                d,
                askMessage(t, d.name, [], card.overtime_minor === null) +
                  words.question(ask, plan.people),
              ),
      askWords: ask,
      tiers: (card.price_tiers ?? []).map((tier) => words.tier(tier)),
    };
  };
  const rows: CompareRow[] = [
    {
      key: 'day',
      label: t({ id: 'drivers.compare.day', message: 'A day' }),
      cells: drivers.map((d, i) => priceCell(d, cards[i] as DriverCard)),
    },
    {
      key: 'each',
      label:
        chosen.length > 1
          ? t({ id: 'drivers.compare.eachDays', message: `Each, ${chosen.length} days` })
          : t({ id: 'drivers.compare.each', message: 'Each' }),
      cells: drivers.map((d, i) => {
        const each = money(columnOf(i).eachMinor, d.terms.currency, locale);
        const value =
          each === null ? DASH : isFloor(cards[i] as DriverCard) ? words.from(each) : each;
        return text(value, risk?.name === d.name ? 'risk' : undefined);
      }),
    },
    {
      key: 'car',
      label: t({ id: 'drivers.compare.car', message: 'Car' }),
      cells: drivers.map((d) =>
        text(
          [d.terms.car, d.terms.seats === null ? null : String(d.terms.seats)]
            .filter(Boolean)
            .join(' · ') || DASH,
        ),
      ),
    },
    {
      key: 'speaks',
      label: t({ id: 'drivers.compare.speaks', message: 'Speaks' }),
      cells: drivers.map((d) =>
        text(d.terms.languages.map((l) => l.toUpperCase()).join(' · ') || DASH),
      ),
    },
    ...(['tolls', 'entry'] as const).map((key) => ({
      key,
      label:
        key === 'tolls'
          ? t({ id: 'drivers.compare.tolls', message: 'Tolls' })
          : t({ id: 'drivers.compare.entry', message: 'Entry fees' }),
      cells: drivers.map((d) => {
        const said = d.terms.includes[key] ?? 'unknown';
        if (said === 'unknown') return d.terms.source === 'private_tour' ? text(DASH) : notSaid(d);
        return said === 'yes'
          ? text(t({ id: 'drivers.compare.yes', message: '✓Yes' }), 'good')
          : text(t({ id: 'drivers.compare.notIncl', message: 'Not incl.' }));
      }),
    })),
    {
      key: 'overtime',
      label: t({ id: 'drivers.compare.overtime', message: 'Overtime' }),
      cells: drivers.map((d) => {
        const card = driverCardOf(d);
        if (card.overtime_minor === null)
          return d.terms.source === 'private_tour' ? text(DASH) : notSaid(d);
        return text(
          t({
            id: 'drivers.compare.perHour',
            message: `${money(card.overtime_minor, card.currency, locale) ?? ''}/hr`,
          }),
        );
      }),
    },
    {
      key: 'licence',
      label: t({ id: 'drivers.compare.licence', message: 'Licence' }),
      cells: drivers.map((d) =>
        d.terms.source === 'private_tour'
          ? text(t({ id: 'drivers.compare.supplierChecks', message: 'Supplier checks' }))
          : d.terms.licence_shown === true
            ? text(t({ id: 'drivers.compare.shows', message: 'Shows it' }))
            : notSaid(d),
      ),
    },
  ];
  const parent = driversRoute(tripId);
  return {
    plan,
    state,
    refresh,
    drivers,
    cards,
    missing: drivers.map((_, i) => columnOf(i).notSaid.length),
    rows,
    header,
    risk: risk === null ? null : riskLine(t, risk, locale),
    parent,
    pick: (id: string) =>
      router.push(driversRoute(tripId, 'pick', { provider: id, ...(days ? { days } : {}) })),
    addAnother: () => goBackOr(parent),
  };
}
