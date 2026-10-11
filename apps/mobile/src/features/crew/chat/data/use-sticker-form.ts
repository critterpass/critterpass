/**
 * What a sticker message draws: the critter form it points at (its renderer kind, seed and palette)
 * and the name the viewer knows it by. A form whose catalogue row is not on the phone yet has no art
 * until it syncs. Stickers wear the plain white edge, so tier rings are dropped here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { critters, type FormSpec, type Palette } from '@cp/critter-art';
import { useMemo } from 'react';

import { useQuietLiveRows } from '@/data/powersync/live-rows';

const KIND_BY_KEY = new Map(critters.map((critter) => [critter.id, critter.kind]));

export interface StickerArt {
  readonly kind: string;
  readonly name: string;
  readonly seed: number | null;
  readonly form: FormSpec | null;
}

interface Row {
  readonly critter_key: string;
  readonly species: string;
  readonly seed: number | null;
  readonly rarity: FormSpec['rarity'];
  readonly palette: string | null;
  readonly critter_name: string | null;
}

const SQL = `SELECT c.key AS critter_key, c.species, c.canonical_seed AS seed, f.rarity, f.palette,
    (SELECT e.critter_name FROM collection_entries e
      WHERE e.form_id = f.id AND e.critter_name IS NOT NULL LIMIT 1) AS critter_name
  FROM critter_forms f JOIN critters c ON c.id = f.critter_id
  WHERE f.id = ?`;

/** The form's look without its tier ring; null when the palette cannot be read. */
export function plainFormSpec(rarity: FormSpec['rarity'], palette: string | null): FormSpec | null {
  if (palette === null) return null;
  try {
    const parsed = JSON.parse(palette) as Palette | null;
    if (parsed === null || typeof parsed !== 'object') return null;
    return { rarity, palette: parsed, edge: 'none' };
  } catch {
    return null;
  }
}

export function stickerArtKind(critterKey: string): string {
  return KIND_BY_KEY.get(critterKey) ?? critterKey;
}

export function useStickerArt(formId: string | null): StickerArt | null {
  const { rows } = useQuietLiveRows<Row>(SQL, formId === null ? null : [formId], [
    'critter_forms',
    'critters',
    'collection_entries',
  ]);
  const row = rows[0];
  return useMemo(
    () =>
      row === undefined
        ? null
        : {
            kind: stickerArtKind(row.critter_key),
            name: row.critter_name ?? row.species,
            seed: row.seed === null ? null : Number(row.seed),
            form: plainFormSpec(row.rarity, row.palette),
          },
    [row],
  );
}
