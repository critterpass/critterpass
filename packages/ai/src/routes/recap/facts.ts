/**
 * The recap's aggregates worded for the guide: amounts formatted in the crew's currency, distances
 * in kilometres to one decimal, dates as a short range, people by first name. These facts are the
 * only source of numbers the copy may use, and the template copy reads the same ones, so the guide
 * and the fallback can never disagree with the cards the app draws.
 */
import type {
  RecapAwardDraft,
  RecapContent,
  RecapGotAway,
  RecapReceipt,
  RecapRoute,
} from '@cp/domain';

import type { RecapCopyAward, RecapCopyFacts } from './schema';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const RIDE_NAMES: Readonly<Record<string, string>> = {
  grab: 'Grab',
  gojek: 'Gojek',
  uber: 'Uber',
  taxi: 'the taxis',
  transfer: 'the transfer',
  driver: 'the driver',
};

export interface RecapFactsContext {
  readonly place: string;
  readonly crew: string | null;
  /** Display names by user id. */
  readonly names: ReadonlyMap<string, string>;
}

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** `2–4 Oct 2026`, `30 Sep – 3 Oct 2026` or `30 Dec 2026 – 2 Jan 2027`. */
export function recapDateRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  const mon = (m: number) => MONTHS[m - 1] ?? '';
  if (start === end) return `${a.day} ${mon(a.month)} ${a.year}`;
  if (a.year !== b.year)
    return `${a.day} ${mon(a.month)} ${a.year} – ${b.day} ${mon(b.month)} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${mon(a.month)} – ${b.day} ${mon(b.month)} ${b.year}`;
  return `${a.day}–${b.day} ${mon(b.month)} ${b.year}`;
}

/** `VND 5,700,000`, `USD 460` or `USD 12.50`: minor units in the currency's own exponent. */
export function formatRecapMoney(minor: number, currency: string): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const value = Math.abs(minor) / 10 ** digits;
  const whole = Number.isInteger(value);
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${currency} ${text}`;
}

const km = (metres: number) => Math.round(metres / 100) / 10;

export function recapFirstName(name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/u)[0];
  return first === undefined || first.length === 0 ? 'Someone' : first;
}

function routeFacts(route: RecapRoute, stats: RecapContent['stats']): RecapCopyFacts['route'] {
  const longest = route.longest_leg === null ? undefined : route.legs[route.longest_leg];
  const stopNames = route.stops.map((stop) => stop.name);
  const sunrise = stats.superlatives[0];
  return {
    km: km(route.total_m),
    estimated: route.estimated,
    stops: stopNames.filter((name, index) => stopNames.indexOf(name) === index),
    longest_leg:
      longest === undefined
        ? null
        : {
            from: route.stops[longest.from]?.name ?? '',
            to: route.stops[longest.to]?.name ?? '',
            km: km(longest.distance_m),
            minutes: longest.minutes,
          },
    driver:
      route.top_driver === null
        ? null
        : {
            name:
              route.top_driver.provider_name ??
              RIDE_NAMES[route.top_driver.provider] ??
              'the driver',
            km: km(route.top_driver.distance_m),
          },
    before_sunrise:
      sunrise === undefined
        ? null
        : { place: sunrise.name, time: sunrise.local_time, day: sunrise.day_no },
  };
}

function receiptFacts(receipt: RecapReceipt): RecapCopyFacts['receipt'] {
  const money = (minor: number) => formatRecapMoney(minor, receipt.currency);
  const under = receipt.under_minor;
  return {
    currency: receipt.currency,
    total: money(receipt.total_minor),
    each: money(receipt.each_minor),
    expenses: receipt.expenses,
    meals: receipt.meals,
    planned_total: receipt.planned_total_minor === null ? null : money(receipt.planned_total_minor),
    under: under !== null && under > 0 ? money(under) : null,
    over: under !== null && under < 0 ? money(under) : null,
    priciest:
      receipt.priciest === null
        ? null
        : { what: receipt.priciest.description, amount: money(receipt.priciest.amount_minor) },
    cheapest_day:
      receipt.cheapest_day === null
        ? null
        : { day: receipt.cheapest_day.day_no, each: money(receipt.cheapest_day.each_minor) },
    settled: receipt.settled,
    still_owed: receipt.settled ? null : money(receipt.outstanding_minor),
    settled_days_after_end: receipt.settled_days_after_end,
  };
}

function comesBack(window: RecapGotAway['next_window']): string | null {
  if (window === null) return null;
  const from = FULL_MONTHS[parts(window.from).month - 1] ?? '';
  const to = FULL_MONTHS[parts(window.to).month - 1] ?? '';
  return from === to ? from : `${from} to ${to}`;
}

export function recapCopyFacts(
  content: Pick<RecapContent, 'stats' | 'route' | 'receipt' | 'got_away'>,
  context: RecapFactsContext,
): RecapCopyFacts {
  const { stats, got_away: gotAway } = content;
  const name = (uid: string) => recapFirstName(context.names.get(uid));
  return {
    place: context.place,
    crew: context.crew,
    dates: recapDateRange(stats.start_date, stats.end_date),
    days: stats.days,
    travellers: stats.travellers,
    people: [...context.names.values()].map((full) => recapFirstName(full)),
    critters: {
      forms_found: stats.critters.forms_found,
      new_critters: stats.critters.new_critters,
    },
    route: routeFacts(content.route, stats),
    receipt: receiptFacts(content.receipt),
    got_away:
      gotAway === null
        ? null
        : {
            rarity: gotAway.rarity,
            sightings: gotAway.sightings,
            missed_by: gotAway.seen_by.map(name),
            forms_found: gotAway.forms_found,
            forms_total: gotAway.forms_total,
            comes_back: comesBack(gotAway.next_window),
          },
    best_day:
      stats.best_day === null
        ? null
        : {
            day: stats.best_day.day_no,
            date: recapDateRange(stats.best_day.local_date, stats.best_day.local_date),
          },
  };
}

/** The awards as the guide sees them: first names, and only the evidence a line may quote. */
export function recapCopyAwards(
  awards: readonly RecapAwardDraft[],
  names: ReadonlyMap<string, string>,
): RecapCopyAward[] {
  return awards.map((award) => {
    const evidence: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(award.evidence)) {
      if (typeof value === 'string' || typeof value === 'number') evidence[key] = value;
    }
    delete evidence['poi_id'];
    return {
      user_id: award.user_id,
      name: recapFirstName(names.get(award.user_id)),
      award: award.kind,
      metric: award.metric,
      value: award.value,
      evidence,
    };
  });
}
