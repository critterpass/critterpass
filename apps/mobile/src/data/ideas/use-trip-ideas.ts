/**
 * The trip's Ideas (7f-2): every place the crew saved for the trip that isn't in a day of the plan
 * yet and that I haven't hidden, oldest first, each with who backs it and its last worked-out fit.
 * Synced rows only, so Ideas reads the same offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { storedFitSchema, type StoredFit } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

/**
 * Placed: a place in the trip's current version (a pinned idea by its own name and spot); hidden:
 * a place I hid. `local_state` holds who I am.
 */
export const IDEAS_SQL = `SELECT i.id, i.poi_id, i.name, i.name_local, i.category, i.lat, i.lng,
    i.backer_ids, i.sources, i.source_url, i.fit, i.fit_version_id, i.created_at,
    EXISTS (SELECT 1 FROM plan_items pi
      WHERE pi.version_id = (SELECT current_version_id FROM trips WHERE id = i.trip_id)
        AND (pi.poi_id = i.poi_id OR (i.poi_id IS NULL
          AND json_extract(pi.custom_place, '$.name') = i.name
          AND abs(json_extract(pi.custom_place, '$.lat') - i.lat) < 0.0005
          AND abs(json_extract(pi.custom_place, '$.lng') - i.lng) < 0.0005))) AS placed,
    EXISTS (SELECT 1 FROM place_hides h
      WHERE h.poi_id = i.poi_id AND h.user_id = (SELECT value FROM local_state WHERE id = ?)) AS hidden
  FROM trip_ideas i
  WHERE i.trip_id = ? AND i.deleted_at IS NULL
  ORDER BY i.created_at, i.id`;
export const IDEAS_TABLES = ['trip_ideas', 'plan_items', 'trips', 'place_hides', 'local_state'];

export interface IdeaRow {
  readonly id: string;
  readonly poi_id: string | null;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly backer_ids: string | null;
  readonly sources: string | null;
  readonly source_url: string | null;
  readonly fit: string | null;
  readonly fit_version_id: string | null;
  readonly created_at: string;
  readonly placed: number;
  readonly hidden: number;
}

export interface TripIdeaView {
  readonly id: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly backerIds: readonly string[];
  readonly sources: readonly string[];
  readonly sourceUrl: string | null;
  /** The plan check's last fit for it; `fit.version_id` says which plan version it answers. */
  readonly fit: StoredFit | null;
}

export interface TripIdeas {
  readonly loaded: boolean;
  /** Saved, not in a day, not hidden by me. */
  readonly ideas: readonly TripIdeaView[];
  readonly placedCount: number;
  readonly hiddenCount: number;
}

/** A JSON text array (or a Postgres array literal from older payloads) as strings. */
export function textArray(raw: string | null): string[] {
  if (raw === null || raw === '') return [];
  if (raw.startsWith('{')) {
    return raw
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .map((entry) => entry.replace(/"/gu, '').trim())
      .filter((entry) => entry.length > 0);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function storedFit(raw: string | null): StoredFit | null {
  if (raw === null || raw === '') return null;
  try {
    const parsed = storedFitSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ideasFrom(rows: readonly IdeaRow[]): Omit<TripIdeas, 'loaded'> {
  const ideas: TripIdeaView[] = [];
  let placedCount = 0;
  let hiddenCount = 0;
  for (const row of rows) {
    if (row.placed === 1) {
      placedCount += 1;
      continue;
    }
    if (row.hidden === 1) {
      hiddenCount += 1;
      continue;
    }
    ideas.push({
      id: row.id,
      poiId: row.poi_id,
      name: row.name,
      nameLocal: row.name_local,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      backerIds: textArray(row.backer_ids),
      sources: textArray(row.sources),
      sourceUrl: row.source_url,
      fit: storedFit(row.fit),
    });
  }
  return { ideas, placedCount, hiddenCount };
}

export function useTripIdeas(tripId: string | null): TripIdeas {
  const rows = useLiveRows<IdeaRow>(
    IDEAS_SQL,
    tripId === null ? null : [OWNER_UID_KEY, tripId],
    IDEAS_TABLES,
  );
  return useMemo(
    () => ({ loaded: rows.loaded, ...ideasFrom(rows.rows) }),
    [rows.loaded, rows.rows],
  );
}
