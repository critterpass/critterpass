/**
 * Any place, read through the api (`GET /v1/places/{id}`) with the last good copy kept on the
 * phone: a place the phone does not hold (search, a pasted link, a push, chat) opens its page,
 * goes on a plan and starts GO online, and opens again offline once it has been seen. The trip's
 * own places are on the phone already (the trip stream's cards); callers read those first.
 * `profile` is the place's AI-written text when the api has one (`pending` while it is written).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, storage key or wire value, never copy. */
import { useEffect, useState } from 'react';

import {
  createLastGoodCache,
  readThrough,
  useTravelDataReader,
  type Classification,
  type LastGoodCache,
  type TravelDataReader,
  type WireParser,
} from '../travel-data/client';
import type { ReadState } from '../travel-data/freshness';

/** Places kept for offline; past this the oldest is dropped. */
export const PLACE_CACHE_MAX = 400;

const FACT_KINDS: ReadonlySet<string> = new Set(['entry', 'hours', 'dress', 'know']);
/** Facts the server keeps only with a second source (or the place's own site) behind them. */
const TWO_SOURCE_KINDS: ReadonlySet<string> = new Set(['entry', 'hours']);

export interface ProfileFact {
  readonly kind: 'entry' | 'hours' | 'dress' | 'know';
  readonly text: string;
  readonly sourceUrl: string;
  /** How a second source backs the fact (`agrees`, `own_site`, `no`, `n/a`), when the api says. */
  readonly secondSource?: string;
}

export interface ReadyProfile {
  readonly status: 'ready';
  /** The language the lines are in: the reader's, else English while a translation is made. */
  readonly locale: string;
  readonly whyGo: string;
  readonly bestTime: string;
  readonly crowd: string;
  readonly visitMin: number | null;
  readonly facts: readonly ProfileFact[];
  readonly photos: readonly { readonly url: string; readonly sourcePage: string }[];
  readonly sources: readonly { readonly url: string; readonly title: string }[];
  readonly generatedAt: string;
}

export type PlaceProfile = { readonly status: 'pending' } | ReadyProfile;

/** `GET /v1/places/{id}` as the phone reads it (services/api/src/places/detail.ts). */
export interface PlaceWire {
  readonly id: string;
  readonly destinationId: string | null;
  readonly timezone: string | null;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly priceLevel: number | null;
  readonly hours: unknown;
  readonly editorial: unknown;
  readonly profile: PlaceProfile | null;
}

type Bag = Readonly<Record<string, unknown>>;
const bag = (value: unknown): Bag | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : null;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function factOf(value: unknown): ProfileFact[] {
  const fact = bag(value);
  const kind = str(fact?.['kind']);
  const text = str(fact?.['text']);
  const sourceUrl = str(fact?.['sourceUrl']);
  if (kind === null || !FACT_KINDS.has(kind) || text === null || sourceUrl === null) return [];
  const second = str(fact?.['secondSource']);
  return [
    {
      kind: kind as ProfileFact['kind'],
      text,
      sourceUrl,
      ...(second === null ? {} : { secondSource: second }),
    },
  ];
}

/** The profile, or null when it is absent or unreadable (the page then stands without it). */
export function profileOf(value: unknown): PlaceProfile | null {
  const profile = bag(value);
  if (profile?.['status'] === 'pending') return { status: 'pending' };
  if (profile?.['status'] !== 'ready') return null;
  const locale = str(profile['locale']);
  if (locale === null) return null;
  return {
    status: 'ready',
    locale,
    whyGo: str(profile['whyGo']) ?? '',
    bestTime: str(profile['bestTime']) ?? '',
    crowd: str(profile['crowd']) ?? '',
    visitMin: num(profile['visitMin']),
    facts: list(profile['facts']).flatMap(factOf),
    photos: list(profile['photos']).flatMap((entry) => {
      const url = str(bag(entry)?.['url']);
      return url === null ? [] : [{ url, sourcePage: str(bag(entry)?.['sourcePage']) ?? '' }];
    }),
    sources: list(profile['sources']).flatMap((entry) => {
      const url = str(bag(entry)?.['url']);
      return url === null ? [] : [{ url, title: str(bag(entry)?.['title']) ?? '' }];
    }),
    generatedAt: str(profile['generatedAt']) ?? '',
  };
}

/** The place answer, or nothing when it is not a place (the read then falls back to its copy). */
export const placeWireSchema: WireParser<PlaceWire> = {
  safeParse(value) {
    const place = bag(value);
    const id = str(place?.['id']);
    const name = str(place?.['name']);
    const lat = num(place?.['lat']);
    const lng = num(place?.['lng']);
    if (
      place === null ||
      id === null ||
      name === null ||
      name === '' ||
      lat === null ||
      lng === null
    ) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        id,
        destinationId: str(place['destinationId']),
        timezone: str(place['timezone']),
        name,
        nameLocal: str(place['nameLocal']),
        category: str(place['category']) ?? 'other',
        lat,
        lng,
        address: str(place['address']),
        priceLevel: num(place['priceLevel']),
        hours: place['hours'],
        editorial: place['editorial'],
        profile: profileOf(place['profile']),
      },
    };
  },
};

/** Whether a profile fact rests on one source only, so the page asks to check it before going. */
export function singleSource(fact: ProfileFact): boolean {
  if (fact.secondSource !== undefined) {
    return fact.secondSource !== 'agrees' && fact.secondSource !== 'own_site';
  }
  return !TWO_SOURCE_KINDS.has(fact.kind);
}

export function placePath(placeId: string): string {
  return `/v1/places/${encodeURIComponent(placeId)}`;
}

const classify = (): Classification => ({ status: 'ok', seenAt: null });

let shared: LastGoodCache | undefined;

/** The phone's place copies (MMKV, their own instance), the newest 400. */
export function placeCache(): LastGoodCache {
  shared ??= createLastGoodCache('cp-places', { max: PLACE_CACHE_MAX });
  return shared;
}

/** One read: the api's answer (kept as the last good copy), else that copy, else missing. */
export function readPlace(
  reader: TravelDataReader | null,
  placeId: string,
  options: { readonly cache?: LastGoodCache; readonly signal?: AbortSignal } = {},
): Promise<ReadState<PlaceWire>> {
  return readThrough({
    reader,
    cache: options.cache ?? placeCache(),
    path: placePath(placeId),
    schema: placeWireSchema,
    classify,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

/** How long the page waits before asking again for a profile being written, and how often. */
const PROFILE_POLL_MS = 4_000;
const PROFILE_POLLS = 5;

/**
 * The place from the api with its last good copy; a null `placeId` reads nothing (`missing`).
 * While its profile is being written the place is read again a few times, so the text fills in on
 * the open page; the answer on screen stays until the next one lands. A new `attempt` reads again.
 */
export function usePlaceRead(placeId: string | null, attempt = 0): ReadState<PlaceWire> {
  const reader = useTravelDataReader();
  const [poll, setPoll] = useState({ id: placeId, n: 0 });
  const round = poll.id === placeId ? poll.n : 0;
  const [answer, setAnswer] = useState<{ id: string; state: ReadState<PlaceWire> } | null>(null);
  useEffect(() => {
    if (placeId === null) return undefined;
    const controller = new AbortController();
    void readPlace(reader, placeId, { signal: controller.signal }).then((state) => {
      if (!controller.signal.aborted) setAnswer({ id: placeId, state });
    });
    return () => controller.abort();
  }, [placeId, reader, round, attempt]);
  const state: ReadState<PlaceWire> =
    placeId === null
      ? { status: 'missing', reason: 'no_data' }
      : answer?.id === placeId
        ? answer.state
        : { status: 'loading' };
  const pending =
    (state.status === 'ok' || state.status === 'stale') && state.data.profile?.status === 'pending';
  useEffect(() => {
    if (!pending || round >= PROFILE_POLLS) return undefined;
    const timer = setTimeout(() => setPoll({ id: placeId, n: round + 1 }), PROFILE_POLL_MS);
    return () => clearTimeout(timer);
  }, [pending, round, placeId]);
  return state;
}
