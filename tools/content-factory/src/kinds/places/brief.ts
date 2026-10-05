/**
 * The places brief: for each guide destination, its pinned places (./pins), its landmarks
 * (./landmarks) and the curated selection (./select) of the POIs the importer left, their
 * duplicate sweep (./duplicates) and generation units of open-data fields only. A landmark beyond
 * the importer's area enters as an editorial place made from its Wikidata item.
 */
import { createDecisionClient, createGateway, loadDecisionEnv, loadGatewayEnv } from '@cp/ai';

import { openPool } from '../../db';
import { DUPLICATE_RULINGS, LEFT_OUT_PLACES, PINNED_PLACES } from '../../data/pinned-places';
import { curatedDestinations, placeFacts } from '../../data/place-facts';
import { recordingFetch } from '../../record';
import type { Brief, GenerationUnit } from '../types';
import { defaultHttp } from '../media/http';
import {
  decideDuplicates,
  farNamesakes,
  landmarkNamesakes,
  longFeatureDuplicates,
  nearbyPairs,
} from './duplicates';
import { dayTripReach, kmOutside } from './day-trips';
import { destinationLandmarks, type Landmark } from './landmarks';
import { duplicatesOf, intoKept } from './merges';
import { pinnedPoiIds, pinnedPois } from './pins';
import { namedFood } from './note-checks';
import type { PoiSource } from './pois';
import { DEFAULT_POIS_PER_CITY, selectCurated } from './select';
import { accented, nearbyRecords } from './spellings';

const POIS_PER_CALL = 15;

const GUIDE_DESTINATIONS = curatedDestinations().map(({ code, slug }) => {
  const facts = placeFacts(code);
  return { code, slug, tz: facts.tz, language: (facts.languages[0] ?? 'en').split('-')[0] ?? 'en' };
});

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
    mustSee: true,
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
      const pins = await pinnedPois(
        pool,
        destinationId,
        PINNED_PLACES[destination.slug] ?? [],
        console.log,
      );
      const pinned = [...pins.keys()];
      const leftOut = new Set(
        await pinnedPoiIds(pool, destinationId, LEFT_OUT_PLACES[destination.slug] ?? [], (line) =>
          console.log(line.replace('pinned', 'left-out')),
        ),
      );
      const { landmarks, matched, ...beyond } = await destinationLandmarks(
        pool,
        destinationId,
        destination.language,
        defaultHttp(),
      );
      // A day trip the app can neither route to nor draw is left out.
      const reach = dayTripReach(destination.slug);
      const outside = beyond.outside.filter((l) => reach === null || kmOutside(reach, l) === 0);
      for (const l of beyond.outside.filter((o) => !outside.includes(o))) {
        console.log(`day trip out of reach: ${l.name}, ${reach ? kmOutside(reach, l) : 0} km`);
      }
      const unmatched = landmarks.filter(
        (l) => !matched.some((m) => m.landmark.id === l.id) && !beyond.outside.includes(l),
      );
      console.log(
        `landmarks ${destination.slug}: ${landmarks.length}, ${matched.length} matched; beyond the import: ${outside.map((l) => l.name).join(', ') || 'none'}; no place: ${unmatched.map((l) => l.name).join(', ') || 'none'}`,
      );
      const localNames = new Map(
        matched.flatMap((m) =>
          m.wholeName && m.landmark.nameLocal !== null
            ? [[m.poiId, m.landmark.nameLocal] as const]
            : [],
        ),
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
        leftOut,
      );
      const mustSee = new Set(
        [...pinned, ...matched.map((m) => m.poiId)].filter((id) => pins.get(id)?.mustSee !== false),
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
        const kind = pins.get(row.id)?.kind;
        return [
          {
            ref,
            destination: destination.slug,
            code: destination.code,
            name: row.name,
            // Open data often holds only the English name of a landmark.
            nameLocal:
              row.name_local ??
              pins.get(row.id)?.nameLocal ??
              [localNames.get(row.id)].find((n) => n?.toLowerCase() !== row.name.toLowerCase()) ??
              null,
            category:
              pins.get(row.id)?.category ??
              recategorised.get(row.id) ??
              (row.category === 'other' && namedFood(row.name) ? 'food' : row.category),
            lat: row.lat,
            lng: row.lng,
            address: row.address,
            tz: row.timezone ?? destination.tz,
            hours: row.hours_verified_at === null ? null : row.hours,
            duplicate: null,
            ...(mustSee.has(row.id) ? { mustSee: true } : {}),
            ...(pins.get(row.id)?.essential === true ? { essential: true } : {}),
            ...(kind === undefined ? {} : { kind }),
          },
        ];
      });
      open.push(...outside.map((landmark) => landmarkSource(landmark, destination)));
      const long = longFeatureDuplicates(open, landmarks);
      const landmarkRefs = [
        ...matched.flatMap((m) => {
          const ref = refOf.get(m.poiId);
          return ref === undefined ? [] : [{ item: m.landmark, ref }];
        }),
        ...outside.map((l) => ({ item: l, ref: landmarkSource(l, destination).ref })),
      ];
      const pinnedRefs = new Set(pinned.flatMap((id) => refOf.get(id) ?? []));
      const kept = new Set([...pinnedRefs, ...landmarkRefs.map((l) => l.ref)]);
      const pairs = [
        // A must-see is the record that stays when the two are one place.
        ...(await nearbyPairs(pool, destinationId, curated)).map((pair) =>
          kept.has(pair.b.ref) && !kept.has(pair.a.ref) ? { ...pair, a: pair.b, b: pair.a } : pair,
        ),
        ...long.pairs,
        ...landmarkNamesakes(open, landmarkRefs, pinnedRefs),
      ].filter((pair) => !pinnedRefs.has(pair.b.ref));
      const verdicts = await decideDuplicates(client, pairs);
      const far = farNamesakes(open, landmarkRefs, pinnedRefs);
      const duplicateOf = duplicatesOf(
        [...intoKept(long.merges, kept), ...far],
        pairs,
        verdicts,
        DUPLICATE_RULINGS[destination.slug] ?? [],
      );
      const near = await nearbyRecords(pool, destinationId, curated);
      const idOf = new Map([...refOf].map(([id, ref]) => [ref, id]));
      const sources = open.map((source) => {
        const same = open.filter((o) => {
          const duplicate = duplicateOf.get(o.ref);
          return duplicate?.verdict === 'merge' && duplicate.of === source.ref;
        });
        return {
          ...source,
          ...accented(source, same, near.get(idOf.get(source.ref) ?? '') ?? []),
          duplicate: duplicateOf.get(source.ref) ?? null,
        };
      });
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
