/**
 * The places brief: for each guide destination, its pinned places (./pins), its landmarks
 * (./landmarks) and the curated selection (./select) of the POIs the importer left, their
 * duplicate sweep (./duplicates) and generation units of open-data fields only. A landmark beyond
 * the importer's area enters as an editorial place made from its Wikidata item.
 */
import { createDecisionClient, createGateway, loadDecisionEnv, loadGatewayEnv } from '@cp/ai';

import { openPool } from '../../db';
import { PINNED_PLACES } from '../../data/pinned-places';
import { PLACE_FACTS } from '../../data/place-facts';
import { recordingFetch } from '../../record';
import type { Brief, GenerationUnit } from '../types';
import { defaultHttp } from '../media/http';
import {
  decideDuplicates,
  farNamesakes,
  longFeatureDuplicates,
  nearbyDifferentNames,
  type DuplicatePair,
  type DuplicateVerdict,
} from './duplicates';
import { destinationLandmarks, type Landmark } from './landmarks';
import { pinnedPoiIds } from './pins';
import type { PoiSource } from './pois';
import { DEFAULT_POIS_PER_CITY, selectCurated } from './select';

const POIS_PER_CALL = 15;

const GUIDE_DESTINATIONS = Object.entries(PLACE_FACTS).flatMap(([code, facts]) =>
  facts.destination === null
    ? []
    : [
        {
          code,
          slug: facts.destination,
          tz: facts.tz,
          language: (facts.languages[0] ?? 'en').split('-')[0] ?? 'en',
        },
      ],
);

/** A landmark the import never reached, as an editorial place (Wikidata is CC0). */
function landmarkSource(
  landmark: Landmark,
  destination: { readonly slug: string; readonly code: string; readonly tz: string },
): PoiSource {
  return {
    ref: `editorial:wikidata-${landmark.id}`,
    destination: destination.slug,
    code: destination.code,
    name: landmark.name,
    nameLocal: landmark.nameLocal,
    category: landmark.category ?? 'other',
    lat: landmark.lat,
    lng: landmark.lng,
    address: null,
    tz: destination.tz,
    hours: null,
    duplicate: null,
  };
}

/** Network boundary for the duplicate decisions (tests replay recorded responses through it). */
export const placesNetwork: { fetch?: typeof fetch } = {};

function fetchOption(): { fetch?: typeof fetch } {
  const record = process.env['CONTENT_FACTORY_RECORD'];
  return placesNetwork.fetch !== undefined
    ? { fetch: placesNetwork.fetch }
    : record
      ? { fetch: recordingFetch(record) }
      : {};
}

function briefGateway() {
  return process.env['ANTHROPIC_API_KEY']
    ? createGateway({ ...loadGatewayEnv(), ...fetchOption() })
    : null;
}

function decisionClient(gateway: ReturnType<typeof briefGateway>) {
  return createDecisionClient({
    apiKey: loadDecisionEnv().apiKey,
    ...fetchOption(),
    ...(gateway ? { gateway } : {}),
  });
}

type Duplicate = { readonly of: string; readonly verdict: DuplicateVerdict };

/**
 * Each place's duplicate: a same-named long feature merges into its group's place; otherwise the
 * last decided pair naming it wins. A merge that would close a loop (A into B into A, hiding both)
 * is left out.
 */
function duplicatesOf(
  merges: readonly { from: string; into: string }[],
  pairs: readonly DuplicatePair[],
  verdicts: ReadonlyMap<string, DuplicateVerdict>,
): Map<string, Duplicate> {
  const found = new Map<string, Duplicate>();
  const loops = (from: string, of: string) => {
    for (let at: string | undefined = of; at !== undefined;) {
      if (at === from) return true;
      const next = found.get(at);
      at = next?.verdict === 'merge' ? next.of : undefined;
    }
    return false;
  };
  for (const merge of merges) found.set(merge.from, { of: merge.into, verdict: 'merge' });
  const grouped = new Set(found.keys());
  for (const pair of pairs) {
    const verdict = verdicts.get(`${pair.a.ref}|${pair.b.ref}`) ?? 'review';
    if (verdict === 'distinct' || grouped.has(pair.b.ref)) continue;
    if (verdict === 'merge' && loops(pair.b.ref, pair.a.ref)) continue;
    found.set(pair.b.ref, { of: pair.a.ref, verdict });
  }
  return found;
}

export async function poisBrief(options: Readonly<Record<string, string>>): Promise<Brief> {
  const pool = openPool();
  if (pool === null) throw new Error('the places brief reads imported POIs: set DATABASE_URL');
  const wanted = options['destinations']?.split(',');
  const gateway = briefGateway();
  const client = decisionClient(gateway);
  const target = Number(options['pois_per_city'] ?? DEFAULT_POIS_PER_CITY);
  const maxCostMicros = Math.round(Number(options['selection_max_usd'] ?? 5) * 1_000_000);
  try {
    const units: GenerationUnit[] = [];
    for (const destination of GUIDE_DESTINATIONS.filter(
      (d) => wanted === undefined || wanted.includes(d.slug),
    )) {
      const found = await pool.query<{ id: string }>(
        'SELECT id FROM destinations WHERE slug = $1',
        [destination.slug],
      );
      const destinationId = found.rows[0]?.id;
      if (destinationId === undefined) continue;
      const pinned = await pinnedPoiIds(
        pool,
        destinationId,
        PINNED_PLACES[destination.slug] ?? [],
        console.log,
      );
      const { landmarks, matched, outside } = await destinationLandmarks(
        pool,
        destinationId,
        destination.language,
        defaultHttp(),
      );
      const unmatched = landmarks.filter(
        (l) => !matched.some((m) => m.landmark.id === l.id) && !outside.includes(l),
      );
      console.log(
        `landmarks ${destination.slug}: ${landmarks.length}, ${matched.length} matched; beyond the import: ${outside.map((l) => l.name).join(', ') || 'none'}; no place: ${unmatched.map((l) => l.name).join(', ') || 'none'}`,
      );
      const recategorised = new Map(
        matched.flatMap((m) =>
          m.landmark.category === null || !m.wholeName
            ? []
            : [[m.poiId, m.landmark.category] as const],
        ),
      );
      const selected = await selectCurated(
        pool,
        { id: destinationId, slug: destination.slug },
        target,
        {
          gateway,
          maxCostMicros,
          log: console.log,
        },
        [...pinned, ...matched.map((m) => m.poiId)],
      );
      const curated = [...new Set([...pinned, ...selected])];
      const { rows } = await pool.query<{
        id: string;
        source_ids: Record<string, string>;
        name: string;
        name_local: string | null;
        category: string;
        lat: number;
        lng: number;
        address: string | null;
        timezone: string | null;
        hours: unknown;
        hours_verified_at: Date | null;
      }>(
        `SELECT p.id, p.source_ids, p.name, p.name_local, p.category, p.lat, p.lng, p.address, p.timezone,
           p.hours, p.hours_verified_at
         FROM pois p JOIN destinations d ON d.id = p.destination_id
         WHERE d.slug = $1 AND p.id = ANY($2::uuid[]) AND p.status = 'active' AND p.merged_into_id IS NULL
         ORDER BY p.name`,
        [destination.slug, curated],
      );
      const refOf = new Map<string, string>();
      const open: PoiSource[] = rows.flatMap((row) => {
        const source = (['editorial', 'fsq_os', 'overture'] as const).find(
          (s) => row.source_ids[s] !== undefined,
        );
        if (source === undefined) return [];
        const ref = `${source}:${row.source_ids[source]}`;
        refOf.set(row.id, ref);
        return [
          {
            ref,
            destination: destination.slug,
            code: destination.code,
            name: row.name,
            nameLocal: row.name_local,
            category: recategorised.get(row.id) ?? row.category,
            lat: row.lat,
            lng: row.lng,
            address: row.address,
            tz: row.timezone ?? destination.tz,
            hours: row.hours_verified_at === null ? null : row.hours,
            duplicate: null,
          },
        ];
      });
      open.push(...outside.map((landmark) => landmarkSource(landmark, destination)));
      const long = longFeatureDuplicates(open, landmarks);
      const pairs = [...(await nearbyDifferentNames(pool, destinationId, curated)), ...long.pairs];
      const verdicts = await decideDuplicates(client, pairs);
      const landmarkRefs = [
        ...matched.flatMap((m) => {
          const ref = refOf.get(m.poiId);
          return ref === undefined ? [] : [{ item: m.landmark, ref }];
        }),
        ...outside.map((l) => ({ item: l, ref: landmarkSource(l, destination).ref })),
      ];
      const pinnedRefs = new Set(pinned.flatMap((id) => refOf.get(id) ?? []));
      const far = farNamesakes(open, landmarkRefs, pinnedRefs);
      const duplicateOf = duplicatesOf([...long.merges, ...far], pairs, verdicts);
      const sources = open.map((source) => ({
        ...source,
        duplicate: duplicateOf.get(source.ref) ?? null,
      }));
      for (let start = 0; start < sources.length; start += POIS_PER_CALL) {
        const chunk = sources.slice(start, start + POIS_PER_CALL);
        units.push({
          id: `${destination.slug}-${String(start / POIS_PER_CALL + 1).padStart(3, '0')}`,
          input: chunk,
        });
      }
    }
    return { units };
  } finally {
    await pool.end();
  }
}
