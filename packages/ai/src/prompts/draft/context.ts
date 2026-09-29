/**
 * What every drafting prompt is built from, and how it reads to the guide. The facts come from
 * code: our place ids and names, opening hours on the date, visit lengths, the day's usable hours,
 * counts of tastes and chronotypes. Budgets appear only as "keep it cheap" pressure, never as an
 * amount, and closures reach the planner, not the prompt. Text a crew member wrote (a freeform
 * must-do, a redraft note, chat) only ever enters inside an untrusted data block.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { WEEKDAYS, type Hours } from '@cp/domain';
import type { CandidatePools, CostBands, DraftPoi, TravelMatrix, TripFrame } from '@cp/planner';

import type { Gateway, GatewayInput, GatewayResult } from '../../client';
import { renderPersonaBlock } from '../../persona/layering';
import { REPO_PACKS } from '../../persona/loader';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';

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
  /** Must-dos a member wrote without a place: flavour only, never scheduled. */
  readonly wishes: readonly { readonly id: string; readonly text: string }[];
  /** Stable ids for scheduled stops; the same key always gives the same id. */
  readonly idFor: (key: string) => string;
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
    { type: 'text', text: renderPersonaBlock(REPO_PACKS[guide]) },
    { type: 'text', text: task },
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

export function placeLine(
  input: Pick<DraftPlanInput, 'pois' | 'frame'>,
  poi: DraftPoi,
  date: string | null,
): string {
  const parts = [
    aliases(input).place(poi.id),
    poi.name,
    poi.category,
    `visit ${poi.durationMin} min`,
  ];
  if (date !== null) {
    parts.push(hoursOn(poi.hours, date));
    const latest = lastStartOn(poi.hours, date, poi.durationMin);
    if (latest !== null) parts.push(`start by ${latest}`);
  }
  if (poi.priceLevel !== null)
    parts.push(poi.priceLevel === 0 ? 'free' : `price ${'$'.repeat(poi.priceLevel)}`);
  const tags = poi.tags.filter((tag) => !tag.startsWith('book_ahead'));
  if (tags.length > 0) parts.push(tags.slice(0, 4).join(' '));
  return `- ${parts.join(' | ')}`;
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
