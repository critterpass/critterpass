/**
 * The forms a person may wear, from their own verified finds (one per form, rarest first): what
 * "From your Critterdex" lists. The server checks ownership again when the avatar is set.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { ownedFormsOf, type OwnedForm } from './owned-form-order';

export type { OwnedForm };

const SQL = `SELECT DISTINCT f.key, f.rarity FROM collection_entries e
  JOIN critter_forms f ON f.id = e.form_id
  WHERE e.user_id = ? AND e.verification <> 'revoked' AND f.key IS NOT NULL`;
const TABLES = ['collection_entries', 'critter_forms'];

export function useOwnedForms(): readonly OwnedForm[] {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<{ key: string; rarity: string }>(
    SQL,
    uid === null ? null : [uid],
    TABLES,
  );
  return ownedFormsOf(rows);
}
