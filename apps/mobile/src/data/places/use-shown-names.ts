/**
 * The names places are shown under on this phone, by the shared rule (`@cp/domain` `shownName`):
 * a reader whose app language is one of the destination's own sees the local name ("Thung lũng
 * Tình Yêu"), anyone else the first ("Valley of Love"); the other name stays for a second line
 * and for search. The destination's languages come from the synced dex sets: its own set, else
 * the set of the country its slug starts with (`vn-da-lat` → VN), as the api reads them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { readsLocalNames, shownPlaceName, type NamedPlace } from '@cp/domain';
import { useLingui } from '@lingui/react';
import { useCallback, useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

const LANGUAGES_SQL = `SELECT s.languages FROM critter_sets s JOIN destinations d ON d.id = ?
  WHERE s.destination_id = d.id
     OR upper(s.country) = upper(substr(d.slug, 1, instr(d.slug || '-', '-') - 1))
  ORDER BY (s.destination_id = d.id) DESC, s.code LIMIT 1`;
const LANGUAGES_TABLES = ['critter_sets', 'destinations'];

/** A synced text array: JSON (`["vi"]`) or a Postgres literal (`{vi}`). */
export function languageList(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (raw.startsWith('{')) {
    return raw
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .map((part) => part.replace(/"/gu, '').trim())
      .filter((part) => part !== '');
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

export interface PlaceNamer {
  /** The reader sees local names in this destination. */
  readonly readsLocal: boolean;
  /** The name shown. */
  readonly name: (place: NamedPlace) => string;
  /** The other name, when it differs: for a second line. */
  readonly other: (place: NamedPlace) => string | null;
}

/** Whether this reader sees a destination's places under their local names. */
export function useReadsLocalNames(destinationId: string | null | undefined): boolean {
  const { i18n } = useLingui();
  const rows = useLiveRows<{ languages: string | null }>(
    LANGUAGES_SQL,
    destinationId === null || destinationId === undefined ? null : [destinationId],
    LANGUAGES_TABLES,
  ).rows;
  return readsLocalNames(i18n.locale, languageList(rows[0]?.languages));
}

export function usePlaceNamer(destinationId: string | null | undefined): PlaceNamer {
  const readsLocal = useReadsLocalNames(destinationId);
  const name = useCallback(
    (place: NamedPlace) => shownPlaceName(place, readsLocal).shown,
    [readsLocal],
  );
  const other = useCallback(
    (place: NamedPlace) => shownPlaceName(place, readsLocal).other,
    [readsLocal],
  );
  return useMemo(() => ({ readsLocal, name, other }), [readsLocal, name, other]);
}
