/**
 * Publish writers for content that lands in tables other areas own: persona packs (read by the
 * guide through llm.persona_packs) and the editorial overlay of curated POIs. The guest pack has no
 * guide row; it ships in the package release and the AI package's repo packs.
 */
import type { ContentItem } from '@cp/content';
import type pg from 'pg';

import { allowIndexMaintenance } from '../places/batch-sql';
import { PublishRefusedError } from './writers-core';

export async function writePersonas(
  tx: pg.PoolClient,
  items: readonly ContentItem<'personas'>[],
  version: number,
): Promise<void> {
  const { rows } = await tx.query<{ slug: string; id: string }>('SELECT slug, id FROM guides');
  const guides = new Map(rows.map((row) => [row.slug, row.id]));
  for (const item of items) {
    if (item.id === 'guest') continue;
    const guideId = guides.get(item.id);
    if (guideId === undefined) throw new PublishRefusedError(`guide ${item.id} does not exist`);
    const { id, version: _version, status, local_words, voice_id, ...style } = item.pack;
    void id;
    void _version;
    void status;
    await tx.query(
      `INSERT INTO persona_packs (guide_id, version, status, style, lexicon, voice_settings, approved_at)
       VALUES ($1, $2, 'approved', $3, $4, $5, now())
       ON CONFLICT (guide_id, version) DO UPDATE SET style = EXCLUDED.style, lexicon = EXCLUDED.lexicon,
         voice_settings = EXCLUDED.voice_settings, status = 'approved', approved_at = now()`,
      [
        guideId,
        `content-v${version}`,
        JSON.stringify({ ...style, ai_disclosure: item.ai_disclosure }),
        JSON.stringify({ local_words: local_words ?? [] }),
        JSON.stringify({ voice_id: voice_id ?? null }),
      ],
    );
    await tx.query('UPDATE guides SET persona_pack_version = $2 WHERE id = $1', [
      guideId,
      `content-v${version}`,
    ]);
  }
}

/**
 * A match on one source id, written so the per-source unique indexes serve it: the key is a literal
 * and the `?` guard repeats the indexes' partial predicate. Without either, Postgres scans every POI
 * of every destination for each published row.
 */
function sourceIdMatch(source: string, param: string): string {
  if (source !== 'fsq_os' && source !== 'overture' && source !== 'editorial') {
    throw new PublishRefusedError(`unknown POI source ${source}`);
  }
  return `source_ids ? '${source}' AND source_ids ->> '${source}' = ${param}`;
}

/** True for a row that already reads as the item says (parameters as in the overlay `UPDATE`). */
const AS_PUBLISHED = `name = $2 AND name_local IS NOT DISTINCT FROM $3 AND category = $4
  AND tags IS NOT DISTINCT FROM $5 AND curation = 'editorial' AND timezone IS NOT DISTINCT FROM $7
  AND (editorial || $6::jsonb) = editorial AND ($8::jsonb IS NULL OR hours = $8::jsonb)`;

/**
 * Overlays editorial text, the must-see flag, taste tags and verified hours onto curated POIs,
 * matched by source id; a POI the importer has not brought in yet is created from the release
 * item. The overlay is merged key by key: what the item does not carry (an absent `must_see`, the
 * researched place facts) stays as it is, and `must_see: false` clears the flag.
 *
 * A places release re-states every curated place of every destination, so a row that already
 * reads as its item says is left alone: rewriting thousands of unchanged rows would churn the two
 * large text indexes on `pois` for nothing. Any write that remains may still pay for merging one
 * of those indexes' pending lists, which passes the usual statement limit on a table this size,
 * so the publish waits for it as the ingest does.
 */
export async function writePlaces(
  tx: pg.PoolClient,
  items: readonly ContentItem<'places'>[],
): Promise<void> {
  const { rows } = await tx.query<{ slug: string; id: string }>(
    'SELECT slug, id FROM destinations',
  );
  const destinations = new Map(rows.map((row) => [row.slug, row.id]));
  await allowIndexMaintenance(tx);
  for (const poi of items) {
    const destinationId = destinations.get(poi.destination);
    if (destinationId === undefined) {
      throw new PublishRefusedError(`destination ${poi.destination} does not exist`);
    }
    const { source, source_id } = poi.licence;
    const editorial = JSON.stringify(poi.editorial);
    const updated = await tx.query(
      `UPDATE pois SET name = $2, name_local = $3, category = $4, tags = $5, editorial = editorial || $6::jsonb,
         curation = 'editorial', timezone = $7,
         hours = COALESCE($8::jsonb, hours),
         hours_verified_at = CASE WHEN $8::jsonb IS NULL THEN hours_verified_at ELSE now() END
       WHERE ${sourceIdMatch(source, '$1')} AND NOT (${AS_PUBLISHED})`,
      [
        source_id,
        poi.name,
        poi.name_local,
        poi.category,
        poi.tags,
        editorial,
        poi.tz,
        poi.hours === null ? null : JSON.stringify(poi.hours),
      ],
    );
    if ((updated.rowCount ?? 0) > 0) continue;
    const existing = await tx.query(
      `SELECT 1 FROM pois WHERE ${sourceIdMatch(source, '$1')} LIMIT 1`,
      [source_id],
    );
    if ((existing.rowCount ?? 0) > 0) continue;
    await tx.query(
      `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address, tags, editorial,
         curation, timezone, hours, hours_verified_at, source_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'editorial', $10, COALESCE($11::jsonb, '{}'::jsonb),
         CASE WHEN $11::jsonb IS NULL THEN NULL ELSE now() END, jsonb_build_object($12::text, $13::text))`,
      [
        destinationId,
        poi.name,
        poi.name_local,
        poi.category,
        poi.lat,
        poi.lng,
        poi.address,
        poi.tags,
        editorial,
        poi.tz,
        poi.hours === null ? null : JSON.stringify(poi.hours),
        source,
        source_id,
      ],
    );
  }
  // Records decided to be the same place redirect to the one they duplicate.
  for (const poi of items.filter((item) => item.merge_into !== null)) {
    const [fromSource, ...fromId] = poi.ref.split(':');
    const [toSource, ...toId] = (poi.merge_into ?? '').split(':');
    await tx.query(
      `UPDATE pois SET merged_into_id = target.id
       FROM (SELECT id FROM pois WHERE ${sourceIdMatch(toSource ?? '', '$2')}) AS target
       WHERE ${sourceIdMatch(fromSource ?? '', '$1')} AND pois.id <> target.id
         AND pois.merged_into_id IS DISTINCT FROM target.id`,
      [fromId.join(':'), toId.join(':')],
    );
  }
}
