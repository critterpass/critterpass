/**
 * The ways to reach a trip's destination from a home city
 * (`GET /v1/destinations/{id}/getting-there?from`): one way per mode (flight, train, bus, car,
 * boat), each an estimate of the journey time and what it costs one person, with the pages it was
 * written from. The answer belongs to the pair of places, never to a traveller. It is written on
 * demand, so the first read of a pair answers `pending`; a written answer is kept for offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { areaLinkModeSchema } from '@cp/domain';
import type { AreaLinkMode } from '@cp/domain';

import type { LastGoodCache, TravelDataReader } from '@/data/travel-data/client';

export interface WaySource {
  readonly url: string;
  readonly title: string | null;
}

export interface WayThere {
  readonly mode: AreaLinkMode;
  /** One way. */
  readonly minutes: number;
  readonly cost: { readonly amountMinor: number; readonly currency: string } | null;
  readonly note: string | null;
  readonly sources: readonly WaySource[];
}

export interface HomeCity {
  /** The IATA code of the home airport or metro group. */
  readonly key: string;
  readonly city: string;
}

interface GettingThereWire {
  readonly status: 'ready' | 'pending' | 'none';
  readonly origin: HomeCity;
  readonly ways: readonly WayThere[];
  readonly generatedAt: string | null;
}

export type GettingThereRead =
  | {
      readonly status: 'ready';
      readonly origin: HomeCity;
      readonly ways: readonly WayThere[];
      /** When the estimate was written. */
      readonly generatedAt: string | null;
      /** A kept copy, shown because the api could not be reached. */
      readonly saved: boolean;
    }
  /** Looked up, and no way with a cited journey time was found. */
  | { readonly status: 'none'; readonly origin: HomeCity }
  /** Being written right now: ask again shortly. */
  | { readonly status: 'pending' }
  | { readonly status: 'failed'; readonly reason: 'offline' | 'error' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';

function wayOf(value: unknown): WayThere | null {
  if (!isRecord(value)) return null;
  const mode = areaLinkModeSchema.safeParse(value['mode']);
  const minutes = value['minutes'];
  if (!mode.success || typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const cost = value['cost_pp_minor'];
  const currency = value['cost_currency'];
  const sources = Array.isArray(value['sources']) ? (value['sources'] as unknown[]) : [];
  return {
    mode: mode.data,
    minutes,
    cost:
      typeof cost === 'number' && cost >= 0 && text(currency)
        ? { amountMinor: cost, currency }
        : null,
    note: text(value['note']) ? value['note'] : null,
    sources: sources.flatMap((source) =>
      isRecord(source) && text(source['url']) && /^https?:\/\//i.test(source['url'])
        ? [{ url: source['url'], title: text(source['title']) ? source['title'] : null }]
        : [],
    ),
  };
}

/** Lenient: a way the phone cannot read (a mode it does not know yet) is left out. */
function wireOf(value: unknown): GettingThereWire | null {
  if (!isRecord(value) || !isRecord(value['origin']) || !Array.isArray(value['ways'])) return null;
  const { status, origin } = value;
  if (status !== 'ready' && status !== 'pending' && status !== 'none') return null;
  if (!text(origin['key']) || !text(origin['city'])) return null;
  return {
    status,
    origin: { key: origin['key'], city: origin['city'] },
    ways: (value['ways'] as unknown[]).flatMap((way) => {
      const read = wayOf(way);
      return read === null ? [] : [read];
    }),
    generatedAt: text(value['generated_at']) ? value['generated_at'] : null,
  };
}

export function gettingTherePath(destinationId: string | null, from: string | null): string | null {
  if (destinationId === null || destinationId === '' || from === null || from === '') return null;
  return `/v1/destinations/${encodeURIComponent(destinationId)}/getting-there?from=${encodeURIComponent(from)}`;
}

function settled(wire: GettingThereWire, saved: boolean): GettingThereRead | null {
  if (wire.ways.length > 0) {
    return {
      status: 'ready',
      origin: wire.origin,
      ways: wire.ways,
      generatedAt: wire.generatedAt,
      saved,
    };
  }
  return wire.status === 'none' ? { status: 'none', origin: wire.origin } : null;
}

export interface ReadGettingThereInput {
  readonly reader: TravelDataReader | null;
  readonly cache: LastGoodCache;
  readonly path: string;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

/**
 * One read of a pair. A written answer (ways, or "none found") is kept and shown again when the
 * api cannot be reached; an answer still being written is never kept, and with no kept copy a
 * failure is reported as one rather than as an empty list.
 */
export async function readGettingThere(input: ReadGettingThereInput): Promise<GettingThereRead> {
  const kept = (reason: 'offline' | 'error'): GettingThereRead => {
    const saved = input.cache.get(input.path);
    const wire = saved === undefined ? null : wireOf(saved.body);
    return (wire === null ? null : settled(wire, true)) ?? { status: 'failed', reason };
  };
  if (input.reader === null) return kept('offline');
  let response: { status: number; body: unknown };
  try {
    response = await input.reader.getJson(input.path, input.signal);
  } catch {
    return kept('offline');
  }
  if (response.status < 200 || response.status >= 300) return kept('error');
  const wire = wireOf(response.body);
  if (wire === null) return kept('error');
  const answer = settled(wire, false);
  if (answer === null) return { status: 'pending' };
  input.cache.set(input.path, response.body, input.now ?? new Date());
  return answer;
}

/** The pages the ways were written from, each once, in the order the ways name them. */
export function sourcesOf(ways: readonly WayThere[]): WaySource[] {
  const seen = new Set<string>();
  return ways.flatMap((way) =>
    way.sources.filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    }),
  );
}
