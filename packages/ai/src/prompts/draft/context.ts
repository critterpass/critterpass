/**
 * What every drafting prompt is built from, and how it reads to the guide. The facts come from
 * code: our place ids and names, opening hours on the date, visit lengths, the day's usable hours,
 * counts of tastes and chronotypes. Budgets appear only as "keep it cheap" pressure, never as an
 * amount, and closures reach the planner, not the prompt. Text a crew member wrote (a freeform
 * must-do, a redraft note, chat) only ever enters inside an untrusted data block.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { WEEKDAYS, type DraftItem, type Hours } from '@cp/domain';
import {
  foodRole,
  placeTime,
  type CandidatePools,
  type CostBands,
  type DraftPoi,
  type PlaceTime,
  type TravelMatrix,
  type TripFrame,
  type WishTime,
} from '@cp/planner';

import type { Gateway, GatewayInput, GatewayResult } from '../../client';
import { renderPersonaBlock } from '../../persona/layering';
import { spanOf } from './areas';
import { PLAN_VOICE } from './hedge';
import { resolvePersonaPack } from '../../persona/resolve';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';

/** The guide's answer to a must-do typed by hand, as code holds it (./wish-answers.ts). */
export interface WishAnswer {
  readonly wishId: string;
  /** The place the guide says the wish means; null when none of the offered places fits. */
  readonly poiId: string | null;
  readonly dayNo: number | null;
  readonly when: WishTime;
  /** Weekdays the wished thing happens on at all (`sa`, `su`; empty = any day), e.g. a weekly show. */
  readonly weekdays: readonly string[];
}

/**
 * A must-do planned without the time of day or the show day wished for it: the trip has no day
 * its show runs on (`no_show_day`), or no day can hold it at its time (`no_day_fits`).
 */
export interface UntimedMustDo {
  readonly mustDoId: string;
  readonly reason: 'no_show_day' | 'no_day_fits';
}

/** A stop the organiser already placed on a day (see `DraftPlanInput.held`). */
export interface HeldStop {
  readonly dayNo: number;
  readonly item: DraftItem;
  /**
   * Where the stop is when it sits on a dropped pin (`item.poi_id` null: no place of ours). Give
   * the stops to `withHeldStops` and the planner knows the pin's position and name; the stop's
   * `poi_id` stays null in everything that comes back.
   */
  readonly pin?: { readonly name: string; readonly lat: number; readonly lng: number };
}

export interface DraftPlanInput {
  readonly guide: PersonaId;
  /** "Kyoto, Japan". */
  readonly destination: string;
  readonly frame: TripFrame;
  readonly pois: ReadonlyMap<string, DraftPoi>;
  readonly pools: CandidatePools;
  /** Crew taste tags with how many members hold each. */
  readonly tastes: Readonly<Record<string, number>>;
  readonly bands: CostBands | null;
  readonly travel: TravelMatrix;
  /** The stay type setup chose (`ryokan`), when there is one. */
  readonly stayType: string | null;
  /** Members' first names by uid (as the trip context shows them). */
  readonly names: Readonly<Record<string, string>>;
  /**
   * Must-dos a member wrote without a place, with the places each may mean (`options`); the guide
   * answers each one (./wish-answers.ts).
   */
  readonly wishes: readonly {
    readonly id: string;
    readonly text: string;
    readonly options?: readonly string[];
  }[];
  /** The guide's answers this input was built with (set by `withWishAnswers`). */
  readonly wishAnswers?: readonly WishAnswer[];
  /** Must-dos planned without their time of day or show day (set by `withWishAnswers`). */
  readonly untimed?: readonly UntimedMustDo[];
  /** Stable ids for scheduled stops; the same key always gives the same id. */
  readonly idFor: (key: string) => string;
  /**
   * Stops already on a day that are the organiser's own (placed by hand, `locked_reason: 'user'`,
   * or booked): the guide is told of them and plans the rest of the day around them, and the
   * planner never moves, trims or drops one. Each keeps its place (when it has one), its times,
   * its kind (`meal` when it serves as the day's lunch or dinner) and its id.
   */
  readonly held?: readonly HeldStop[];
  /**
   * The language the organiser reads (BCP 47, e.g. `vi`). A redraft writes its title, summary and
   * notes in it, and the planner's own lines follow; absent, the words are English.
   */
  readonly locale?: string;
  /**
   * The destination's own languages (BCP 47, e.g. `['vi']`). When the organiser's `locale` is one
   * of them, places are shown under their local names (./shown-names.ts).
   */
  readonly destinationLanguages?: readonly string[];
  readonly skeletonRoute: 'draft.skeleton' | 'draft.skeleton_fast';
}

/**
 * One model call, named by `key` (`skeleton`, `day-2`, `repair-1-2`, `summary`), so a job's calls
 * and a recording's responses line up however the parallel day calls finish.
 */
export interface DraftModel {
  call(
    route: Parameters<Gateway['callModel']>[0],
    input: GatewayInput,
    key: string,
  ): Promise<GatewayResult>;
}

export function gatewayModel(
  gateway: Pick<Gateway, 'callModel'>,
  context: UsageContext = {},
): DraftModel {
  return { call: (route, input) => gateway.callModel(route, input, context) };
}

/** Names of the places a prompt may mention (digits in them are part of the name). */
export function placeNames(input: Pick<DraftPlanInput, 'pois'>): string[] {
  return [...input.pois.values()].map((poi) => poi.name);
}

export function personaSystem(guide: PersonaId, task: string): Anthropic.Messages.TextBlockParam[] {
  return [
    { type: 'text', text: renderPersonaBlock(resolvePersonaPack(guide)) },
    { type: 'text', text: `${task}\n\n${PLAN_VOICE}` },
  ];
}

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export const clockText = clock;

export function weekdayOf(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/** Opening hours of a place on one date, as the guide reads them. */
export function hoursOn(hours: Hours | null, date: string): string {
  if (hours === null) return 'open all day';
  const exception = hours.exceptions?.find((entry) => entry.date === date);
  const isoDow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const spans = exception?.spans ?? hours.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? [];
  if (Object.keys(hours.weekly).length === 0 && exception === undefined) return 'hours unknown';
  return spans.length === 0 ? 'closed' : spans.map((s) => `${s.start}–${s.end}`).join(', ');
}

/** The latest local start that still fits a whole visit before closing, on one date. */
export function lastStartOn(hours: Hours | null, date: string, visitMin: number): string | null {
  const shown = hoursOn(hours, date);
  const ends = [...shown.matchAll(/–(\d{2}):(\d{2})/gu)].map(
    (m) => Number(m[1]) * 60 + Number(m[2]),
  );
  const close = ends.length === 0 ? null : Math.max(...ends);
  if (close === null) return null;
  const latest = Math.floor((close - visitMin) / 15) * 15;
  return latest < 0 ? null : clock(latest);
}

/**
 * Short handles for our ids in prompts (`p7` for a place, `m2` for a must-do): a model copies
 * `p7` reliably where it garbles a UUID now and then. Replies are mapped back to the real ids;
 * a handle or id that maps to nothing stays as it is and counts as invented.
 */
export interface Aliases {
  readonly place: (poiId: string) => string;
  readonly mustDo: (mustDoId: string) => string;
  readonly resolvePlace: (ref: string) => string;
  readonly resolveMustDo: (ref: string) => string;
}

const ALIASES = new WeakMap<object, Aliases>();

export function aliases(input: Pick<DraftPlanInput, 'pois' | 'frame'>): Aliases {
  const cached = ALIASES.get(input.pois);
  if (cached !== undefined) return cached;
  const placeIds = [...input.pois.keys()].sort();
  const toPlace = new Map(placeIds.map((id, i) => [id, `p${i + 1}`]));
  const fromPlace = new Map(placeIds.map((id, i) => [`p${i + 1}`, id]));
  const toMustDo = new Map(input.frame.mustDos.map((m, i) => [m.id, `m${i + 1}`]));
  const fromMustDo = new Map(input.frame.mustDos.map((m, i) => [`m${i + 1}`, m.id]));
  const made: Aliases = {
    place: (id) => toPlace.get(id) ?? id,
    mustDo: (id) => toMustDo.get(id) ?? id,
    resolvePlace: (ref) => fromPlace.get(ref.trim().toLowerCase()) ?? ref,
    resolveMustDo: (ref) => fromMustDo.get(ref.trim().toLowerCase()) ?? ref,
  };
  ALIASES.set(input.pois, made);
  return made;
}

const TIME_LABEL: Readonly<Record<PlaceTime, string>> = {
  morning: 'best in the morning',
  sunset: 'for the sunset',
  evening: 'an evening place',
  after_dark: 'for after dark',
};

/** What the planner knows a place is for: a break, or a time of day it holds the stop to. */
export function purposeOf(poi: DraftPoi): string | null {
  const time = placeTime(poi);
  const parts = [
    foodRole(poi) === 'light' ? 'coffee or snack break, never a meal' : null,
    time === null ? null : TIME_LABEL[time],
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(', ');
}

export function placeLine(
  input: Pick<DraftPlanInput, 'pois' | 'frame' | 'pools' | 'travel'>,
  poi: DraftPoi,
  date: string | null,
  area?: string,
): string {
  const parts = [
    aliases(input).place(poi.id),
    poi.name,
    poi.category,
    `visit ${poi.durationMin} min`,
  ];
  const span = spanOf(input, poi);
  if (span !== null) parts.push(span === 'full' ? 'takes the whole day' : 'takes half the day');
  if (area !== undefined) parts.push(`area ${area}`);
  const purpose = purposeOf(poi);
  if (purpose !== null) parts.push(purpose);
  if (date !== null) {
    parts.push(hoursOn(poi.hours, date));
    const latest = lastStartOn(poi.hours, date, poi.durationMin);
    if (latest !== null) parts.push(`start by ${latest}`);
  }
  if (poi.priceLevel !== null)
    parts.push(poi.priceLevel === 0 ? 'free' : `price ${'$'.repeat(poi.priceLevel)}`);
  const tags = poi.tags.filter((tag) => !tag.startsWith('book_ahead') && tag !== 'free');
  if (tags.length > 0) parts.push(tags.slice(0, 4).join(' '));
  if (!poi.editorial) parts.push('uncurated: not checked by our editors, hours are a guess');
  return `- ${parts.join(' | ')}`;
}

/** What our editors wrote about a place (why go, best time), for the lines about a wish. */
export function editorsNote(poi: DraftPoi): string {
  const parts = [
    poi.whyGo ?? null,
    poi.bestTime === null || poi.bestTime === undefined ? null : `best time: ${poi.bestTime}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? '' : `; our editors: ${parts.join('; ')}`;
}

/**
 * Which language the guide writes in, for a reader who does not read English: every word the crew
 * will read (day titles and themes, summaries, notes). Nothing for an English reader.
 */
export function languageLine(locale: string | undefined): string[] {
  if (locale === undefined || locale.toLowerCase().startsWith('en')) return [];
  const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
  return [
    `Write every title, theme, summary and note in ${name} (${locale}), in your own voice: not one sentence in English. Place names stay exactly as the lists write them.`,
  ];
}

export function crewLine(input: DraftPlanInput): string {
  const { frame } = input;
  const early = frame.members.filter((uid) => frame.chronotypes[uid] === 'early_bird').length;
  const late = frame.members.filter((uid) => frame.chronotypes[uid] === 'night_owl').length;
  const tastes = Object.entries(input.tastes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([tag, count]) => `${tag.replaceAll('_', ' ')} (${count})`)
    .join(', ');
  return [
    `Crew of ${frame.members.length}.`,
    tastes.length > 0 ? `Tastes: ${tastes}.` : '',
    `${early} early birds, ${late} night owls.`,
    frame.diets.length > 0 ? `Every meal must suit: ${frame.diets.join(', ')}.` : '',
    frame.budgetPpMinor !== null ? 'The crew set a budget: prefer free and cheaper places.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
