/**
 * Facilities for the six guide destinations: at least one hospital with an emergency department
 * and one pharmacy each (plus clinics where the sources name them). Names and phone numbers must
 * appear in the cited source; coordinates are checked against the destination's country and, like
 * every safety record, verified by a person before anything publishes.
 */
import { FACILITY_KINDS, facilityItemSchema, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { insidePlace } from '../../data/country-bounds';
import { PLACE_FACTS } from '../../data/place-facts';
import { research, searchFromEnv, type ResearchHit } from '../../search';
import {
  checklistTable,
  citedHit,
  numberInSource,
  sourcesBlock,
  todayIso,
} from '../emergency/sources';
import { registerKind } from '../registry';
import type { Brief, GenerationUnit, KindModule, Prompt } from '../types';

const CITY: Readonly<Record<string, string>> = {
  bali: 'Bali Denpasar Kuta Ubud',
  kyoto: 'Kyoto',
  iceland: 'Reykjavik Iceland',
  'mexico-city': 'Mexico City',
  lisbon: 'Lisbon',
  cusco: 'Cusco Peru',
};

/** Local-language searches that find hospitals and pharmacies English queries miss. */
const LOCAL_QUERIES: Readonly<Record<string, readonly string[]>> = {
  bali: ['rumah sakit IGD 24 jam Denpasar Bali', 'apotek 24 jam Denpasar Kuta'],
  kyoto: ['京都市 救急病院 夜間', '京都市 薬局 営業時間'],
  iceland: ['Landspítali bráðamóttaka Fossvogi', 'apótek Reykjavík opið'],
  'mexico-city': [
    'hospital urgencias 24 horas Ciudad de México',
    'farmacia 24 horas Ciudad de México',
  ],
  lisbon: ['Hospital de Santa Maria Lisboa urgência contactos', 'farmácia de serviço Lisboa'],
  cusco: ['clínica emergencias 24 horas Cusco', 'farmacia Cusco centro histórico'],
};
const GENERIC_WORDS = new Set([
  'hospital',
  'pharmacy',
  'clinic',
  'emergency',
  'room',
  'international',
  'center',
  'centre',
  'medical',
  'farmacia',
  'farmácia',
  'clínica',
  'hour',
  'hours',
]);

interface CityInput {
  readonly destination: string;
  readonly code: string;
  readonly hits: readonly ResearchHit[];
}

async function facilitiesBrief(): Promise<Brief> {
  const provider = searchFromEnv();
  const units: GenerationUnit[] = [];
  for (const [code, facts] of Object.entries(PLACE_FACTS)) {
    if (facts.destination === null) continue;
    const city = CITY[facts.destination] ?? facts.destination;
    const hits = [
      ...(await research(
        provider,
        `${city} international hospital 24 hour emergency department address phone`,
        { maxResults: 5 },
      )),
      ...(await research(provider, `${city} 24 hour pharmacy address`, { maxResults: 4 })),
    ];
    for (const query of LOCAL_QUERIES[facts.destination] ?? []) {
      hits.push(...(await research(provider, query, { maxResults: 3 })));
    }
    units.push({
      id: facts.destination,
      input: { destination: facts.destination, code, hits } satisfies CityInput,
    });
  }
  return { units };
}

const outputSchema = z.object({
  facilities: z.array(
    z.object({
      kind: z.enum(FACILITY_KINDS),
      name: z.string(),
      address: z.string(),
      phone: z.string().nullable(),
      open_24h: z.boolean().nullable(),
      lat: z.number(),
      lng: z.number(),
      source_url: z.string(),
    }),
  ),
});
type FacilityOutput = z.infer<typeof outputSchema>['facilities'][number];

function facilitiesPrompt(unit: GenerationUnit): Prompt {
  const input = unit.input as CityInput;
  return {
    system: `You list medical facilities a traveller could need, copied from sources. From the search results pick at least one hospital with an emergency department and one pharmacy (clinics too if the results name them). For each: kind (${FACILITY_KINDS.join(', ')}), name and address as the source gives them, phone only if the source states it (else null), open_24h if the source says so (else null), the latitude and longitude of that address (5 decimals), and source_url copied exactly from the result you used. Never list a facility no result names. Reply with JSON only.`,
    user: `Destination: ${input.destination}.\nSearch results:\n${sourcesBlock(input.hits)}\n\nReturn {"facilities": [...]}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        facilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: [...FACILITY_KINDS] },
              name: { type: 'string' },
              address: { type: 'string' },
              phone: { type: ['string', 'null'] },
              open_24h: { type: ['boolean', 'null'] },
              lat: { type: 'number' },
              lng: { type: 'number' },
              source_url: { type: 'string' },
            },
            required: ['kind', 'name', 'address', 'phone', 'open_24h', 'lat', 'lng', 'source_url'],
            additionalProperties: false,
          },
        },
      },
      required: ['facilities'],
      additionalProperties: false,
    },
  };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 50);

export function toFacility(
  input: CityInput,
  output: FacilityOutput,
  now: Date,
): ContentItem<'facilities'> | null {
  const hit = citedHit(input.hits, output.source_url);
  const content = hit?.content.toLowerCase() ?? '';
  const distinctive = output.name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
  const named =
    distinctive.length === 0
      ? content.includes(output.name.toLowerCase())
      : distinctive.some((w) => content.includes(w));
  if (hit === undefined || !named) return null;
  const dialable = output.phone?.replace(/[().]/gu, '').replace(/\s+/gu, ' ').trim() ?? null;
  const phone =
    dialable !== null && /^\+?[0-9][0-9 -]{1,18}$/u.test(dialable) && numberInSource(hit, dialable)
      ? dialable
      : null;
  const parsed = facilityItemSchema.safeParse({
    ref: `${input.destination}-${slug(output.name)}`,
    destination: input.destination,
    kind: output.kind,
    name: output.name,
    lat: output.lat,
    lng: output.lng,
    address: output.address,
    phone,
    open_24h: output.open_24h,
    source_url: hit.url,
    retrieved_on: todayIso(now),
    verified_at: null,
  });
  return parsed.success ? parsed.data : null;
}

export const facilitiesKind: KindModule<'facilities'> = {
  kind: 'facilities',
  title: () => 'Facilities · six guide cities',
  gate: 'record_verification',
  brief: () => facilitiesBrief(),
  prompt: facilitiesPrompt,
  assemble: (ctx, brief, outputs) =>
    Promise.resolve(
      brief.units.flatMap((unit) => {
        const output = outputs.get(unit.id) as z.infer<typeof outputSchema> | undefined;
        const seen = new Set<string>();
        return (output?.facilities ?? []).flatMap((f) => {
          const item = toFacility(unit.input as CityInput, f, ctx.now);
          if (item === null || seen.has(item.ref)) return [];
          seen.add(item.ref);
          return [item];
        });
      }),
    ),
  validators: {
    items: [
      {
        id: 'inside-country',
        severity: 'fail',
        check: (f) => {
          const code =
            Object.entries(PLACE_FACTS).find(
              ([, facts]) => facts.destination === f.destination,
            )?.[0] ?? '';
          return insidePlace(code, f.lat, f.lng)
            ? []
            : [`${f.name} is placed outside ${f.destination}'s country`];
        },
      },
      {
        id: 'precise-position',
        severity: 'warn',
        check: (f) => {
          const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
          return decimals(f.lat) < 4 || decimals(f.lng) < 4
            ? ['position looks rounded; place the pin from the source address']
            : [];
        },
      },
      {
        id: 'needs-verification',
        severity: 'warn',
        check: (f) =>
          f.verified_at === null ? ['waits for a person to verify it against the source'] : [],
      },
    ],
    batch: [
      {
        id: 'hospital-and-pharmacy',
        severity: 'fail',
        check: ({ items }) =>
          Object.values(PLACE_FACTS)
            .flatMap((facts) => (facts.destination === null ? [] : [facts.destination]))
            .flatMap((destination) =>
              (['hospital', 'pharmacy'] as const)
                .filter(
                  (kind) => !items.some((f) => f.destination === destination && f.kind === kind),
                )
                .map((kind) => ({ ref: null, message: `${destination} has no sourced ${kind}` })),
            ),
      },
    ],
  },
  checklist: (ctx, items) =>
    checklistTable(
      `Facilities · ${ctx.batchKey}`,
      items.map((f) => [
        f.destination,
        f.kind,
        f.name,
        f.address,
        f.phone ?? '',
        `${f.lat}, ${f.lng}`,
        f.source_url,
      ]),
      ['Destination', 'Kind', 'Name', 'Address', 'Phone', 'Position', 'Source'],
    ),
  blockedReason: (items) => {
    const open = items.filter((i) => i.verified_at === null).length;
    return open === 0 ? null : `${open} records wait for a person to verify them`;
  },
};

registerKind(facilitiesKind);
