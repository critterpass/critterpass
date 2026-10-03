/**
 * The recap page (3m-1) as data, from the recap row and its awards only: which state the page is in
 * (the guide still writing, failed, ready), the four stat tiles (a tile with nothing behind it
 * gives way to the next one with a number), the forms card, the one that got away, two award
 * chips and the "updated" badge. Every number here is one the builder wrote; nothing is computed
 * from the trip's own rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- tile ids, award kinds and wire values, never copy. */
import {
  AWARD_KINDS,
  type AwardKind,
  type RecapAwardEvidence,
  type RideProvider,
} from '@cp/domain';

import type { FormRow, RecapAward, RecapContent } from '../data/recap-rows';

export type SummaryPhase = 'loading' | 'writing' | 'failed' | 'ready';

export type SummaryTile =
  | {
      readonly id: 'distance';
      readonly metres: number;
      readonly estimated: boolean;
      /** Who drove most of the ridden kilometres: a name, or the ride app. */
      readonly driver: { readonly name: string | null; readonly provider: RideProvider } | null;
      readonly stops: number;
    }
  | {
      readonly id: 'sunrise';
      readonly place: string;
      readonly localTime: string;
      readonly count: number;
    }
  | {
      readonly id: 'photos';
      readonly count: number;
      readonly top: { readonly name: string; readonly count: number; readonly me: boolean } | null;
    }
  | {
      readonly id: 'owed';
      readonly outstandingMinor: number;
      readonly currency: string;
      readonly settled: boolean;
      readonly settledDaysAfterEnd: number | null;
    }
  | { readonly id: 'days'; readonly days: number; readonly travellers: number }
  | { readonly id: 'finds'; readonly forms: number; readonly newCritters: number }
  | {
      readonly id: 'meals';
      readonly meals: number;
      readonly currency: string;
      readonly eachMinor: number;
    };

export interface SummaryForm {
  readonly id: string;
  readonly row: FormRow;
  /** Found on this trip; otherwise drawn as a silhouette. */
  readonly found: boolean;
  /** The form that got away (the gold silhouette). */
  readonly gotAway: boolean;
}

export interface SummaryFormsCard {
  /** The got-away critter's forms, or this trip's finds when nothing got away. */
  readonly kind: 'got_away' | 'finds';
  readonly forms: readonly SummaryForm[];
  readonly found: number;
  readonly total: number;
}

export interface SummaryGotAway {
  readonly name: string | null;
  readonly rarity: 'epic' | 'legendary';
  readonly sightings: number;
  /** The guide's got-away sentence, once written. */
  readonly line: string | null;
}

export interface SummaryAwardChip {
  readonly id: string;
  readonly kind: AwardKind;
  /** The guide's title for it, once written. */
  readonly title: string | null;
  readonly name: string;
  readonly me: boolean;
  /** The crew's MVP (gold edge). */
  readonly mvp: boolean;
  readonly value: number;
  readonly evidence: RecapAwardEvidence;
}

export interface SummaryModel {
  readonly phase: SummaryPhase;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Null on a solo trip ("just you"). */
  readonly crewName: string | null;
  readonly place: string | null;
  readonly tiles: readonly SummaryTile[];
  readonly forms: SummaryFormsCard | null;
  readonly gotAway: SummaryGotAway | null;
  readonly awards: readonly SummaryAwardChip[];
  /** A late re-run changed the receipt ("late expenses") or something else. */
  readonly updated: 'expenses' | 'other' | null;
  /** The viewer dropped out before the trip and sees how it went. */
  readonly dropout: boolean;
  readonly solo: boolean;
}

export interface SummaryInput {
  readonly loaded: boolean;
  readonly viewerId: string | null;
  /** The viewer travelled (an `in` participant); false for a dropout. */
  readonly viewerIn: boolean;
  readonly trip: {
    readonly startDate: string | null;
    readonly endDate: string | null;
    readonly solo: boolean;
    readonly crewName: string | null;
    readonly place: string | null;
  } | null;
  readonly recap: RecapContent | null;
  readonly awards: readonly RecapAward[];
  /** Display names by user id (the top uploader). */
  readonly names: ReadonlyMap<string, string>;
  /** The got-away critter's forms in catalogue order, or the trip's finds. */
  readonly forms: readonly FormRow[];
  readonly gotAwayName: string | null;
}

const TILE_COUNT = 4;
const CHIP_COUNT = 2;

function tilesOf(input: SummaryInput, recap: RecapContent, solo: boolean): SummaryTile[] {
  const { stats, route, receipt } = recap;
  const tiles: (SummaryTile | null)[] = [];
  if (stats !== null && stats.distance_m > 0) {
    const top = route?.top_driver ?? null;
    tiles.push({
      id: 'distance',
      metres: stats.distance_m,
      estimated: stats.distance_estimated,
      driver: top === null ? null : { name: top.provider_name, provider: top.provider },
      stops: route?.stops.length ?? 0,
    });
  }
  const sunrise = stats?.superlatives[0];
  if (stats !== null && sunrise !== undefined) {
    tiles.push({
      id: 'sunrise',
      place: sunrise.name,
      localTime: sunrise.local_time,
      count: stats.superlatives.length,
    });
  }
  const photos = stats?.photos ?? null;
  if (photos !== null && photos.count > 0) {
    const top = photos.top_uploader;
    tiles.push({
      id: 'photos',
      count: photos.count,
      top:
        top === null || top.count === 0
          ? null
          : {
              name: input.names.get(top.user_id) ?? '',
              count: top.count,
              me: top.user_id === input.viewerId,
            },
    });
  }
  if (!solo && receipt !== null && receipt.expenses > 0) {
    tiles.push({
      id: 'owed',
      outstandingMinor: receipt.outstanding_minor,
      currency: receipt.currency,
      settled: receipt.settled,
      settledDaysAfterEnd: receipt.settled_days_after_end,
    });
  }
  if (stats !== null) {
    tiles.push({ id: 'days', days: stats.days, travellers: stats.travellers });
    if (stats.critters.forms_found > 0) {
      tiles.push({
        id: 'finds',
        forms: stats.critters.forms_found,
        newCritters: stats.critters.new_critters,
      });
    }
  }
  if (receipt !== null && receipt.meals > 0) {
    tiles.push({
      id: 'meals',
      meals: receipt.meals,
      currency: receipt.currency,
      eachMinor: receipt.each_minor,
    });
  }
  return tiles.filter((tile): tile is SummaryTile => tile !== null).slice(0, TILE_COUNT);
}

function formsCardOf(input: SummaryInput, recap: RecapContent): SummaryFormsCard | null {
  const found = new Set(recap.stats?.critters.form_ids ?? []);
  const gotAway = recap.gotAway;
  if (gotAway !== null) {
    const forms = input.forms.map((row) => ({
      id: row.id,
      row,
      found: found.has(row.id),
      gotAway: row.id === gotAway.form_id,
    }));
    if (forms.length === 0) return null;
    return {
      kind: 'got_away',
      forms,
      found: gotAway.forms_found,
      total: gotAway.forms_total,
    };
  }
  const forms = input.forms
    .filter((row) => found.has(row.id))
    .map((row) => ({ id: row.id, row, found: true, gotAway: false }));
  if (forms.length === 0) return null;
  const count = recap.stats?.critters.forms_found ?? forms.length;
  return { kind: 'finds', forms, found: count, total: count };
}

/** The MVP first, then the viewer's own award, then the rest in award order. */
function chipsOf(input: SummaryInput): SummaryAwardChip[] {
  const rank = (award: RecapAward) =>
    (award.mvp ? 0 : 2) + (award.userId === input.viewerId ? 0 : 1);
  return input.awards
    .filter((award) => !award.optedOut)
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        AWARD_KINDS.indexOf(a.kind) - AWARD_KINDS.indexOf(b.kind) ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, CHIP_COUNT)
    .map((award) => ({
      id: award.id,
      kind: award.kind,
      title: award.title,
      name: award.name,
      me: award.userId === input.viewerId,
      mvp: award.mvp,
      value: award.value,
      evidence: award.evidence,
    }));
}

export function buildSummaryModel(input: SummaryInput): SummaryModel {
  const trip = input.trip;
  const solo = trip?.solo === true || (input.recap?.stats?.travellers ?? 0) === 1;
  const base = {
    startDate: input.recap?.stats?.start_date ?? trip?.startDate ?? null,
    endDate: input.recap?.stats?.end_date ?? trip?.endDate ?? null,
    crewName: solo ? null : (trip?.crewName ?? null),
    place: trip?.place ?? null,
    solo,
    dropout: input.loaded && !input.viewerIn,
  };
  const empty = { tiles: [], forms: null, gotAway: null, awards: [], updated: null } as const;
  const recap = input.recap;
  if (!input.loaded) return { phase: 'loading', ...base, ...empty };
  if (recap === null || recap.status === 'queued' || recap.status === 'building') {
    return { phase: 'writing', ...base, ...empty };
  }
  // A ready row whose stats this app cannot read has nothing true to show.
  if (recap.status === 'failed' || recap.stats === null) {
    return { phase: 'failed', ...base, ...empty };
  }
  const gotAway = recap.gotAway;
  return {
    phase: 'ready',
    ...base,
    tiles: tilesOf(input, recap, solo),
    forms: formsCardOf(input, recap),
    gotAway:
      gotAway === null
        ? null
        : {
            name: input.gotAwayName,
            rarity: gotAway.rarity,
            sightings: gotAway.sightings,
            line: recap.cards.got_away?.line ?? null,
          },
    awards: chipsOf(input),
    updated:
      recap.version > 1 && recap.changed.length > 0
        ? recap.changed.includes('receipt')
          ? 'expenses'
          : 'other'
        : null,
  };
}
