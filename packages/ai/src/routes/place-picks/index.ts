/**
 * A destination's well-known places by name (route `places.pick`, pro tier, structured, no
 * thinking, no tools). For a destination our editors have not curated, the model lists what the
 * place is known for from what it knows; it sees only the destination's name and country. The
 * names are leads, never facts: code keeps a name only when one of our own place rows carries it
 * (the worker's pick job), so a place the model invents is dropped. System usage, on no user's
 * meter.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { Gateway, GatewayInput } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';

export const PLACE_PICKS_ROUTE = 'places.pick' as const;
export const PLACE_PICKS_PROMPT_VERSION = 'place-picks@1';
export const PLACE_PICKS_MAX = 60;

/** What kind of place a name is; `cafe` is a food place known for coffee or tea. */
export const PLACE_PICK_KINDS = [
  'temple_shrine',
  'museum',
  'nature',
  'beach',
  'market',
  'food',
  'cafe',
  'nightlife',
  'shopping',
  'other',
] as const;
export type PlacePickKind = (typeof PLACE_PICK_KINDS)[number];

const NAME_MAX = 120;

export const PLACE_PICKS_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['places'],
    properties: {
      places: {
        type: 'array',
        maxItems: PLACE_PICKS_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'local_name', 'kind', 'area'],
          properties: {
            name: { type: 'string', description: 'The name visitors know it by' },
            local_name: {
              type: ['string', 'null'],
              description: 'Its name in the local language and script, as on a local map',
            },
            kind: { type: 'string', enum: [...PLACE_PICK_KINDS] },
            area: {
              type: ['string', 'null'],
              description: 'The ward, district or street it is in',
            },
          },
        },
      },
    },
  },
};

const placeSchema = z.object({
  name: z.string().trim().min(2).max(NAME_MAX),
  local_name: z.string().trim().max(NAME_MAX).nullish(),
  kind: z.enum(PLACE_PICK_KINDS).catch('other'),
  area: z.string().trim().max(NAME_MAX).nullish(),
});
const replySchema = z.object({ places: z.array(z.unknown()) });

export interface NamedPlace {
  readonly name: string;
  readonly localName: string | null;
  readonly kind: PlacePickKind;
  readonly area: string | null;
}

export interface PlacePicksInput {
  /** "Đà Lạt". */
  readonly destination: string;
  /** "Vietnam"; null when the destination row has none. */
  readonly country: string | null;
}

const TASK = [
  '# Task',
  '',
  'List the places a destination is known for, so a trip planner can suggest them to visitors.',
  `- Up to ${PLACE_PICKS_MAX} places inside the destination or a short ride from it, the best known first.`,
  '- A mix: sights and landmarks, nature (lakes, waterfalls, hills, parks, viewpoints), temples and',
  '  churches, museums, markets, places to eat what the destination is known for, cafes, and a few',
  '  places for the evening or for shopping.',
  '- Only real, specific places that have a name and exist today. Never a dish, a neighbourhood, a',
  '  street with nothing named on it, a tour, an event, a hotel, a station, an airport or the',
  '  destination itself. If you are not sure a place exists, leave it out.',
  '- name: the name visitors know it by. local_name: its name in the local language and script,',
  '  exactly as a local map writes it, or null when it is the same or you do not know it.',
  '- kind: what it is. area: the ward, district or street it is in, or null when you do not know.',
  '- Each place once.',
  'Reply with JSON only: {"places":[{"name":"...","local_name":"..."|null,"kind":"...","area":"..."|null}]}',
].join('\n');

export function buildPlacePicksRequest(input: PlacePicksInput): GatewayInput {
  const where = [input.destination, input.country].filter(Boolean).join(', ');
  return {
    system: [{ type: 'text', text: TASK }],
    messages: [{ role: 'user', content: `The destination is ${where}. List its places.` }],
    outputFormat: PLACE_PICKS_FORMAT,
    temperature: 0,
  };
}

/** The well-formed entries of a reply, each name once (case and spacing aside), capped. */
export function checkPlacePicksReply(reply: unknown): NamedPlace[] {
  const parsed = replySchema.safeParse(reply);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const places: NamedPlace[] = [];
  for (const raw of parsed.data.places) {
    const entry = placeSchema.safeParse(raw);
    if (!entry.success) continue;
    const key = entry.data.name.toLowerCase().replace(/\s+/gu, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const local = entry.data.local_name ?? null;
    const area = entry.data.area ?? null;
    places.push({
      name: entry.data.name,
      localName: local === null || local === '' || local === entry.data.name ? null : local,
      kind: entry.data.kind,
      area: area === null || area === '' ? null : area,
    });
    if (places.length === PLACE_PICKS_MAX) break;
  }
  return places;
}

/**
 * Asks for the destination's well-known places. Throws when the call fails or is switched off (the
 * caller decides whether to retry or go on without names); a decline or a malformed reply is an
 * empty list.
 */
export async function nameWellKnownPlaces(
  gateway: Pick<Gateway, 'callModel'>,
  input: PlacePicksInput,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<NamedPlace[]> {
  const request = buildPlacePicksRequest(input);
  const reply = await gateway.callModel(
    PLACE_PICKS_ROUTE,
    options.signal ? { ...request, signal: options.signal } : request,
    options.usage ?? {},
  );
  if (isDeclined(reply.message)) return [];
  return checkPlacePicksReply(parseStructuredText(textOf(reply.message)));
}
