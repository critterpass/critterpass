/**
 * OpenStreetMap places for one destination's bounds (ODbL; the attribution NOTICE and the map credit
 * name OpenStreetMap contributors). Reads the Geofabrik extract (`./osm-extract.ts`) with DuckDB's
 * `spatial` extension (`ST_ReadOSM`), so no system tool is needed. Nodes carry their own point; a
 * way's point is the mean of its nodes and a relation's the mean of its member ways' nodes, which
 * is close enough for a pin and for the 60 m conflation match.
 *
 * Three scans of the file: every node in the bounds plus the tagged ways and relations; then the
 * untagged ways that outline a tagged relation (a park drawn as a multipolygon); the points are
 * joined in SQL. What is kept is classified in `@cp/domain` (`classifyOsmTags`), and
 * `opening_hours` stays raw here; ingest parses it with `parseOsmOpeningHours`.
 */
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { OSM_POI_KEYS, classifyOsmTags, type OsmClassification, type OsmTags } from '@cp/domain';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

import type { BoundingBox } from './ingest';
import { withOsmExtract } from './osm-extract';

export interface OsmPlaceRow {
  /** `n<id>`, `w<id>` or `r<id>`: the `source_ids.osm` key. */
  readonly sourceId: string;
  readonly name: string;
  /** The name in the local language when OSM has both (`name` local, `name:en` English). */
  readonly nameLocal: string | undefined;
  readonly classification: OsmClassification;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | undefined;
  readonly openingHours: string | undefined;
  readonly website: string | undefined;
  readonly phone: string | undefined;
  readonly wikidata: string | undefined;
}

const DUCKDB_TEMP_DIR = path.join(tmpdir(), 'critterpass-osm-duckdb');

async function withSpatialDuckDb<T>(run: (connection: DuckDBConnection) => Promise<T>): Promise<T> {
  await mkdir(DUCKDB_TEMP_DIR, { recursive: true });
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run("SET memory_limit='1GB'");
    await connection.run('SET threads=2');
    await connection.run(`SET temp_directory='${DUCKDB_TEMP_DIR.replaceAll("'", "''")}'`);
    await connection.run('INSTALL spatial');
    await connection.run('LOAD spatial');
    return await run(connection);
  } finally {
    connection.closeSync();
  }
}

const KEY_FILTER = OSM_POI_KEYS.map((key) => `map_contains(tags, '${key}')`).join(' OR ');

function quoted(file: string): string {
  return `'${file.replaceAll("'", "''")}'`;
}

/** Element rows with a point, joined in SQL; tags come back as one JSON object per row. */
function placesSql(): string {
  return `
    WITH way_points AS (
      SELECT w.id, avg(n.lat) AS lat, avg(n.lon) AS lon
      FROM (SELECT id, unnest(refs) AS ref FROM osm_elements WHERE kind = 'way') w
      JOIN osm_elements n ON n.kind = 'node' AND n.id = w.ref
      GROUP BY w.id
    ),
    outline_points AS (
      SELECT o.id, avg(n.lat) AS lat, avg(n.lon) AS lon
      FROM (SELECT id, unnest(refs) AS ref FROM osm_outlines) o
      JOIN osm_elements n ON n.kind = 'node' AND n.id = o.ref
      GROUP BY o.id
    ),
    relation_points AS (
      SELECT r.id, avg(coalesce(wp.lat, op.lat)) AS lat, avg(coalesce(wp.lon, op.lon)) AS lon
      FROM (
        SELECT id, unnest(refs) AS ref, unnest(ref_types) AS ref_type
        FROM osm_elements WHERE kind = 'relation'
      ) r
      LEFT JOIN way_points wp ON r.ref_type = 'way' AND wp.id = r.ref
      LEFT JOIN outline_points op ON r.ref_type = 'way' AND op.id = r.ref
      GROUP BY r.id
    )
    SELECT e.kind::VARCHAR AS kind, e.id, to_json(e.tags)::VARCHAR AS tags,
           coalesce(CASE WHEN e.kind = 'node' THEN e.lat END, wp.lat, rp.lat) AS lat,
           coalesce(CASE WHEN e.kind = 'node' THEN e.lon END, wp.lon, rp.lon) AS lon
    FROM osm_elements e
    LEFT JOIN way_points wp ON e.kind = 'way' AND wp.id = e.id
    LEFT JOIN relation_points rp ON e.kind = 'relation' AND rp.id = e.id
    WHERE map_contains(e.tags, 'name') AND (${KEY_FILTER.replaceAll('tags', 'e.tags')})
  `;
}

const KIND_PREFIX: Readonly<Record<string, string>> = { node: 'n', way: 'w', relation: 'r' };

function text(tags: OsmTags, key: string): string | undefined {
  const value = tags[key]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function addressOf(tags: OsmTags): string | undefined {
  const full = text(tags, 'addr:full');
  if (full !== undefined) return full;
  const street = text(tags, 'addr:street');
  if (street === undefined) return undefined;
  const line = [text(tags, 'addr:housenumber'), street].filter(Boolean).join(' ');
  return [line, text(tags, 'addr:city')].filter(Boolean).join(', ');
}

/** Maps one joined element; null when it has no point inside the bounds or is not a place we read. */
export function toOsmPlaceRow(
  row: {
    readonly kind: string;
    readonly id: unknown;
    readonly tags: string;
    readonly lat: unknown;
    readonly lon: unknown;
  },
  bbox: BoundingBox,
): OsmPlaceRow | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (row.lat === null || row.lon === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) return null;
  const tags = JSON.parse(row.tags) as OsmTags;
  const classification = classifyOsmTags(tags);
  const prefix = KIND_PREFIX[row.kind];
  if (classification === null || prefix === undefined) return null;
  const name = text(tags, 'name') as string;
  const english = text(tags, 'name:en');
  return {
    sourceId: `${prefix}${String(row.id)}`,
    name: english ?? name,
    nameLocal: english !== undefined && english !== name ? name : undefined,
    classification,
    lat,
    lng,
    address: addressOf(tags),
    openingHours: text(tags, 'opening_hours'),
    website: text(tags, 'website') ?? text(tags, 'contact:website'),
    phone: text(tags, 'phone') ?? text(tags, 'contact:phone'),
    wikidata: text(tags, 'wikidata'),
  };
}

/** Reads the places of one local `.osm.pbf` file inside the bounds. */
export async function readOsmFile(file: string, bbox: BoundingBox): Promise<OsmPlaceRow[]> {
  return withSpatialDuckDb(async (connection) => {
    await connection.run(
      `CREATE TEMP TABLE osm_elements AS
       SELECT kind, id, tags, refs, ref_types, lat, lon FROM ST_ReadOSM(${quoted(file)})
       WHERE (kind = 'node' AND lat BETWEEN ${bbox.minLat} AND ${bbox.maxLat}
              AND lon BETWEEN ${bbox.minLng} AND ${bbox.maxLng})
          OR (kind IN ('way', 'relation') AND map_contains(tags, 'name') AND (${KEY_FILTER}))`,
    );
    await connection.run(
      `CREATE TEMP TABLE osm_outlines AS
       SELECT id, refs FROM ST_ReadOSM(${quoted(file)})
       WHERE kind = 'way' AND id IN (
         SELECT unnest(refs) FROM osm_elements WHERE kind = 'relation'
       ) AND id NOT IN (SELECT id FROM osm_elements WHERE kind = 'way')`,
    );
    const reader = await connection.runAndReadAll(placesSql());
    const rows: OsmPlaceRow[] = [];
    for (const row of reader.getRowObjectsJson()) {
      const place = toOsmPlaceRow(
        {
          kind: typeof row['kind'] === 'string' ? row['kind'] : '',
          id: row['id'],
          tags: typeof row['tags'] === 'string' ? row['tags'] : '{}',
          lat: row['lat'],
          lon: row['lon'],
        },
        bbox,
      );
      if (place !== null) rows.push(place);
    }
    return rows;
  });
}

/** OSM places for the bounds from the covering Geofabrik extract; none when no extract covers them. */
export async function readOsmPlaces(bbox: BoundingBox): Promise<OsmPlaceRow[]> {
  return withOsmExtract(bbox, (file) =>
    file === null ? Promise.resolve([]) : readOsmFile(file, bbox),
  );
}
