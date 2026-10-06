/**
 * What a destination link and a way from home share: the modes, the reply shape of one cited way
 * to travel, and its cite-or-drop check. A way stays only when its quote is on the page it cites,
 * is about the place it leads to and states the journey time it claims; its cost stays only
 * when a quote on a cited page states the amount. Nothing is repaired.
 */
import { z } from 'zod';

import { amountsIn } from '../facts-research/validate';
import type { ProfileLocale, ProfilePage } from '../place-profile/prompt';
import { profileUngroundedNumbers } from '../place-profile/validate';
import { foldText } from '../search-parse/validate';
import { citedPage, quoteNamesPlace, type BriefLines, type BriefSource } from './validate';

export const LINK_MODES = ['train', 'bus', 'car', 'boat', 'flight', 'tour'] as const;
export type LinkMode = (typeof LINK_MODES)[number];
export const LINK_MINUTES_MIN = 10;
export const LINK_MINUTES_MAX = 1440;
export const TRAVEL_NOTE_MAX = 200;

const WORDS: Readonly<Record<string, string>> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
};
const N = String.raw`(\d+(?:[.,]\d+)?)`;
const SEP = String.raw`[\s-]*`;
const HOUR = String.raw`(?:hours?|hrs?|h|gio|tieng)(?![a-z])`;
const MIN = String.raw`(?:minutes?|mins?|phut)(?![a-z])`;
const RANGE = String.raw`\s*(?:-|–|—|to|den)\s*`;
const num = (raw: string | undefined) => Number((raw ?? '').replace(',', '.'));

/** Every journey time a text states, in minutes: `[low, high]`, equal for a single figure. */
export function durationsIn(text: string): [number, number][] {
  let flat = foldText(
    text
      .replace(/(\d)\s*½/gu, '$1.5')
      .replace(/½/gu, '0.5')
      .normalize('NFKC'),
  )
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gu, (word) =>
      String(WORDS[word]),
    )
    .replace(/\bhalf an hour\b|\bnua (?:gio|tieng)\b/gu, '30 minutes')
    .replace(/\ban? hour and a half\b/gu, '1.5 hours')
    .replace(/(\d+)\s*(?:and a half|1\/2|½)\s*(?=hours?|hrs?)/gu, '$1.5 ')
    .replace(/(\d+)\s*(gio|tieng) ruoi\b/gu, '$1.5 $2')
    .replace(/\ban hour\b/gu, '1 hour');
  const found: [number, number][] = [];
  const take = (
    pattern: RegExp,
    read: (m: readonly (string | undefined)[]) => [number, number],
  ) => {
    flat = flat.replace(pattern, (...args: (string | undefined)[]) => {
      const [low, high] = read(args);
      if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high >= low) {
        found.push([Math.round(low), Math.round(high)]);
      }
      return ' ';
    });
  };
  take(new RegExp(`(\\d+)${SEP}${MIN}${RANGE}${N}${SEP}${HOUR}`, 'gu'), (m) => [
    num(m[1]),
    num(m[2]) * 60,
  ]);
  take(new RegExp(`${N}${RANGE}${N}${SEP}${HOUR}`, 'gu'), (m) => [num(m[1]) * 60, num(m[2]) * 60]);
  take(new RegExp(`${N}${RANGE}${N}${SEP}${MIN}`, 'gu'), (m) => [num(m[1]), num(m[2])]);
  take(
    new RegExp(
      `${N}${SEP}${HOUR}(?:\\s*(?:and\\s+)?(\\d{1,2})\\s*(?:${MIN}|m(?![a-z]))|(\\d{2})(?![\\d.,]))?`,
      'gu',
    ),
    (m) => {
      const minutes = num(m[1]) * 60 + Number(m[2] ?? m[3] ?? 0);
      return [minutes, minutes];
    },
  );
  take(new RegExp(`(\\d+)${SEP}${MIN}`, 'gu'), (m) => [num(m[1]), num(m[1])]);
  return found;
}

/** True when the quote states a journey time `minutes` is, or a range it falls in. */
export function durationInQuote(minutes: number, quote: string): boolean {
  return durationsIn(quote).some(([low, high]) => minutes >= low && minutes <= high);
}

const citedSchema = { source_url: z.string(), quote: z.string() };
export const wayShape = {
  ...citedSchema,
  minutes: z.number().int(),
  note: z.record(z.string(), z.string()).nullish(),
  cost: z
    .object({ ...citedSchema, amount: z.number().positive(), currency: z.string() })
    .nullish()
    .catch(null),
};
export const waySchema = z.object(wayShape);
export type RawWay = z.infer<typeof waySchema>;

/** A typical price per person, one way, in major units of `currency`. */
export interface TravelCost {
  readonly amount: number;
  readonly currency: string;
}

export interface CheckedWay {
  readonly minutes: number;
  readonly cost: TravelCost | null;
  readonly note: BriefLines;
  /** The page and sentence of the journey time, then the cost's when it has one of its own. */
  readonly sources: readonly BriefSource[];
}

const sourceOf = (page: ProfilePage, quote: string): BriefSource => ({
  url: page.url,
  title: page.title,
  quote: quote.trim(),
});

const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const flatten = (text: string) => foldText(text).replace(/\s+/gu, ' ');

/** Where `text` writes one of `names` in full, as whole words; -1 when it does not. */
function wholeNameIndex(text: string, names: readonly (string | null)[]): number {
  const flat = flatten(text);
  for (const name of names) {
    const wanted = flatten(name ?? '').trim();
    if (wanted.length < 3) continue;
    for (let at = flat.indexOf(wanted); at >= 0; at = flat.indexOf(wanted, at + 1)) {
      if (!isWord(flat[at - 1]) && !isWord(flat[at + wanted.length])) return at;
    }
  }
  return -1;
}

/** A guide often names the place in a heading and the journey in the line under it. */
const HEADING_REACH = 400;

/**
 * True when the citation is about `names`: the quote names one of them, or it names where the
 * journey starts (`from`) and the page names one of them just before the quote.
 */
export function quoteIsAbout(
  quote: string,
  page: ProfilePage,
  names: readonly (string | null)[],
  from: readonly (string | null)[] = [],
): boolean {
  if (quoteNamesPlace(quote, names) || wholeNameIndex(quote, names) >= 0) return true;
  if (wholeNameIndex(quote, from) < 0) return false;
  const text = flatten(`${page.title}\n${page.text}`);
  const at = text.indexOf(flatten(quote).trim());
  return at >= 0 && wholeNameIndex(text.slice(Math.max(0, at - HEADING_REACH), at), names) >= 0;
}

/** One way checked against its pages; a string says why it is dropped. */
export function checkWay(
  way: RawWay,
  pages: readonly ProfilePage[],
  names: readonly (string | null)[],
  locales: readonly ProfileLocale[],
  from: readonly (string | null)[] = [],
): CheckedWay | string {
  const page = citedPage(way.source_url, way.quote, pages);
  if (typeof page === 'string') return page;
  if (!quoteIsAbout(way.quote, page, names, from)) return 'quote_not_about_place';
  if (way.minutes < LINK_MINUTES_MIN || way.minutes > LINK_MINUTES_MAX) return 'bad_minutes';
  if (!durationInQuote(way.minutes, way.quote)) return 'duration_not_in_quote';
  const sources = [sourceOf(page, way.quote)];
  let cost: TravelCost | null = null;
  if (way.cost != null && /^[A-Z]{3}$/u.test(way.cost.currency)) {
    const costPage = citedPage(way.cost.source_url, way.cost.quote, pages);
    if (typeof costPage !== 'string' && amountsIn(way.cost.quote).has(way.cost.amount)) {
      cost = { amount: way.cost.amount, currency: way.cost.currency };
      const source = sourceOf(costPage, way.cost.quote);
      if (source.url !== sources[0]?.url || source.quote !== sources[0]?.quote)
        sources.push(source);
    }
  }
  const text = pages.map((p) => p.text).join('\n');
  const note: Record<string, string> = {};
  for (const locale of locales) {
    const line = way.note?.[locale]?.trim().slice(0, TRAVEL_NOTE_MAX) ?? '';
    if (line !== '' && profileUngroundedNumbers(line, text).length === 0) note[locale] = line;
  }
  return { minutes: way.minutes, cost, note, sources };
}

/** The JSON schema of one way's shared fields, for a structured reply. */
export function wayFormat(locales: readonly ProfileLocale[]) {
  const cited = { source_url: { type: 'string' }, quote: { type: 'string' } };
  return {
    required: ['minutes', 'note', 'cost', 'source_url', 'quote'],
    properties: {
      minutes: { type: 'integer', minimum: LINK_MINUTES_MIN, maximum: LINK_MINUTES_MAX },
      note: {
        type: 'object',
        additionalProperties: false,
        required: [...locales],
        properties: Object.fromEntries(
          locales.map((l) => [l, { type: 'string', maxLength: TRAVEL_NOTE_MAX }]),
        ),
      },
      cost: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['amount', 'currency', 'source_url', 'quote'],
        properties: {
          amount: { type: 'number', minimum: 0 },
          currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          ...cited,
        },
      },
      ...cited,
    },
  };
}

/** The prompt lines every way shares. */
export const WAY_RULES = [
  '- minutes: the one-way journey time the quote states, in minutes (for a range, a value inside',
  '  it). quote: a sentence copied exactly from the page at source_url that names the place and',
  '  states that time. A way with no such sentence is left out.',
  '- cost: what one person typically pays one way, as a plain number in the page currency',
  '  ("250.000 VND" is 250000) with its ISO code, and its own source_url and quote: a sentence',
  '  copied exactly from a page that states the amount. null when no page states a price.',
  '- note: one short line on how the journey goes (where it leaves from, a change on the way).',
  '  No numbers the pages do not state, no names of companies or sellers.',
] as const;
