/**
 * How a destination leads to others (`GET /v1/destinations/{id}/links`): the day trips offered
 * from a city and the way on to the next one, each with its door-to-door time, its mode, what it
 * costs and the pages the figures came from. Links are shared content the phone never syncs, so
 * they are read through the api and the last good answer is kept for offline. An area's own row is
 * not in the catalogue either: its name comes with the link.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { areaLinkKindSchema, areaLinkModeSchema, dayTripLengthSchema } from '@cp/domain';
import type { AreaLinkKind, AreaLinkMode, DayTripLength } from '@cp/domain';

export interface AreaLinkWire {
  readonly id: string;
  readonly kind: AreaLinkKind;
  readonly to: { readonly id: string; readonly name: string; readonly slug?: string | null };
  /** Door to door, one way. */
  readonly minutes: number;
  readonly mode: AreaLinkMode;
  readonly day_length?: DayTripLength | null;
  readonly essential?: boolean | null;
  readonly cost_pp_minor?: number | null;
  readonly cost_currency?: string | null;
  readonly note?: string | null;
  /** The pages a written estimate came from. */
  readonly sources?: readonly { readonly url: string; readonly title?: string | null }[];
}

export interface DestinationLinksWire {
  readonly destination_id: string;
  readonly links: readonly AreaLinkWire[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const text = (value: unknown): value is string => typeof value === 'string' && value !== '';
const textOrNone = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function linkOf(value: unknown): AreaLinkWire | null {
  if (!isRecord(value) || !isRecord(value['to'])) return null;
  const kind = areaLinkKindSchema.safeParse(value['kind']);
  const mode = areaLinkModeSchema.safeParse(value['mode']);
  const length = dayTripLengthSchema.safeParse(value['day_length']);
  const { id, minutes } = value;
  const to = value['to'];
  if (!kind.success || !mode.success || !text(id) || !text(to['id']) || !text(to['name'])) {
    return null;
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;
  const cost = value['cost_pp_minor'];
  const sources = Array.isArray(value['sources']) ? (value['sources'] as unknown[]) : [];
  return {
    id,
    kind: kind.data,
    to: { id: to['id'], name: to['name'], slug: textOrNone(to['slug']) },
    minutes,
    mode: mode.data,
    day_length: length.success ? length.data : null,
    essential: value['essential'] === true,
    cost_pp_minor: typeof cost === 'number' && cost >= 0 ? cost : null,
    cost_currency: textOrNone(value['cost_currency']),
    note: textOrNone(value['note']),
    sources: sources.flatMap((source) =>
      isRecord(source) && text(source['url'])
        ? [{ url: source['url'], title: textOrNone(source['title']) }]
        : [],
    ),
  };
}

/**
 * Reads an answer leniently: a link the phone cannot read (a mode or kind it does not know yet) is
 * left out and the rest still show; only an answer with no `links` list is refused.
 */
export const destinationLinksSchema = {
  safeParse(value: unknown): { success: true; data: DestinationLinksWire } | { success: false } {
    if (!isRecord(value) || !text(value['destination_id']) || !Array.isArray(value['links'])) {
      return { success: false };
    }
    return {
      success: true,
      data: {
        destination_id: value['destination_id'],
        links: (value['links'] as unknown[]).flatMap((link) => {
          const read = linkOf(link);
          return read === null ? [] : [read];
        }),
      },
    };
  },
};

export interface AreaLink {
  readonly id: string;
  readonly kind: AreaLinkKind;
  readonly fromId: string;
  readonly toId: string;
  /** The area's name as its row has it: never translated by the app. */
  readonly toName: string;
  readonly toSlug: string | null;
  /** Door to door, one way. */
  readonly minutes: number;
  readonly mode: AreaLinkMode;
  readonly dayLength: DayTripLength | null;
  /** A first visit to the city includes it. */
  readonly essential: boolean;
  readonly cost: { readonly amountMinor: number; readonly currency: string } | null;
  readonly note: string | null;
  readonly sources: readonly { readonly url: string; readonly title: string | null }[];
}

export function destinationLinksPath(destinationId: string | null): string | null {
  if (destinationId === null || destinationId === '') return null;
  return `/v1/destinations/${encodeURIComponent(destinationId)}/links`;
}

/** The links of one answer in the order the api gives them (the editors' order). */
export function linksOf(wire: DestinationLinksWire): AreaLink[] {
  return wire.links.map((link) => ({
    id: link.id,
    kind: link.kind,
    fromId: wire.destination_id,
    toId: link.to.id,
    toName: link.to.name,
    toSlug: link.to.slug ?? null,
    minutes: link.minutes,
    mode: link.mode,
    dayLength: link.day_length ?? null,
    essential: link.essential === true,
    cost:
      link.cost_pp_minor == null || link.cost_currency == null
        ? null
        : { amountMinor: link.cost_pp_minor, currency: link.cost_currency },
    note: link.note == null || link.note === '' ? null : link.note,
    sources: (link.sources ?? []).map((source) => ({
      url: source.url,
      title: source.title ?? null,
    })),
  }));
}
