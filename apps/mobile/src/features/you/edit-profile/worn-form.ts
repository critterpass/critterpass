/**
 * The form worn as an avatar, as Edit profile names it (3n-3: "TEMPLE TOKEK", "Rare form · found
 * Oct 14"): from the person's own find of that form; nothing when they wear initials or a photo.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows, useOwnerUid } from '../data/live-rows';

export interface WornFormRow {
  readonly form_name: string | null;
  readonly critter_name: string | null;
  readonly rarity: string;
  readonly found_at: string | null;
}

const SQL = `SELECT e.form_name, e.critter_name, f.rarity, e.found_at
  FROM collection_entries e JOIN critter_forms f ON f.id = e.form_id
  WHERE e.user_id = ? AND f.key = ? AND e.verification <> 'revoked'
  ORDER BY e.found_at LIMIT 1`;
const TABLES = ['collection_entries', 'critter_forms'];

export function useWornForm(formKey: string | null): WornFormRow | null {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<WornFormRow>(
    SQL,
    uid === null || formKey === null ? null : [uid, formKey],
    TABLES,
  );
  return rows[0] ?? null;
}
