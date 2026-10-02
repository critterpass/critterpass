/**
 * One form's sticker, for other areas (the profile's avatar picker, "From your Critterdex"): the
 * form's critter art in the form's look, drawn like every sticker (once, after the frame, through
 * the sticker queue) and named as the viewer knows it. Nothing shows until the catalogue row is on
 * the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { Sticker } from '@/ui/sticker/Sticker';

import { artKind } from './art-kind';
import { unknownName } from './critters-copy';
import { useLiveRows, useOwnerUid } from './data/live-rows';
import type { FormRow } from './data/queries';
import { formSpec } from './dex/dex-model';

export interface FormStickerProps {
  /** The form, by id or by its catalogue key (`cp-151:common`). */
  readonly form: string;
  readonly size: number;
}

interface FormStickerRow {
  readonly id: string;
  readonly key: string | null;
  readonly critter_id: string;
  readonly rarity: FormRow['rarity'];
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
  readonly critter_key: string;
  readonly canonical_seed: number | null;
  readonly critter_name: string | null;
}

const FORM_SQL = `SELECT f.id, f.key, f.critter_id, f.rarity, f.palette, f.pose, f.edge,
    c.key AS critter_key, c.canonical_seed,
    (SELECT e.critter_name FROM collection_entries e
      WHERE e.form_id = f.id AND e.user_id = ? AND e.critter_name IS NOT NULL LIMIT 1) AS critter_name
  FROM critter_forms f JOIN critters c ON c.id = f.critter_id
  WHERE f.id = ? OR f.key = ?
  LIMIT 1`;
const FORM_TABLES = ['critter_forms', 'critters', 'collection_entries'];

export function FormSticker({ form, size }: FormStickerProps) {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<FormStickerRow>(
    FORM_SQL,
    uid === null ? null : [uid, form, form],
    FORM_TABLES,
  );
  const row = rows[0];
  if (row === undefined) return null;
  const spec = formSpec({
    id: row.id,
    key: row.key,
    critter_id: row.critter_id,
    rarity: row.rarity,
    palette: row.palette,
    pose: row.pose,
    edge: row.edge,
    requirement_copy: null,
    xp: null,
  });
  return (
    <Sticker
      kind={artKind(row.critter_key)}
      name={row.critter_name ?? unknownName()}
      size={size}
      {...(row.canonical_seed === null ? {} : { seed: row.canonical_seed })}
      {...(spec === null ? {} : { form: spec })}
    />
  );
}
