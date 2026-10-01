/**
 * A critter's detail (3l-3) as data: its four forms (found ones selectable, locked ones with what
 * it takes), the name of the selected form from the viewer's own verified find, where and when it
 * was found, and whether it can be the guide's look (a guide's own critter, a form the viewer owns).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { FormSpec } from '@cp/critter-art';
import type { Rarity } from '@cp/domain';

import type { EntryRow, FormRow } from '../data/queries';
import { formSpec, RARITY_ORDER } from '../dex/dex-model';

export const CRITTER_SQL = `SELECT c.id, c.key, c.no, c.city, c.canonical_seed, c.note,
    s.name AS set_name, s.hero_critter_key, s.guide_slug, g.id AS guide_id, g.name AS guide_name
  FROM critters c JOIN critter_sets s ON s.id = c.set_id
  LEFT JOIN guides g ON g.slug = s.guide_slug
  WHERE c.id = ?`;
export const CRITTER_TABLES = ['critters', 'critter_sets', 'guides'];

export interface CritterDetailRow {
  readonly id: string;
  readonly key: string;
  readonly no: number;
  readonly city: string | null;
  readonly canonical_seed: number | null;
  readonly note: string | null;
  readonly set_name: string | null;
  readonly hero_critter_key: string | null;
  readonly guide_slug: string | null;
  readonly guide_id: string | null;
  readonly guide_name: string | null;
}

export const DETAIL_FORMS_SQL = `SELECT id, key, critter_id, rarity, palette, pose, edge,
    requirement_copy, xp, note
  FROM critter_forms WHERE critter_id = ?`;
export const DETAIL_FORMS_TABLES = ['critter_forms'];

export interface DetailFormRow extends FormRow {
  readonly note: string | null;
}

export const MY_ENTRIES_SQL = `SELECT e.id, e.form_id, e.critter_id, e.verification, e.critter_name,
    e.form_name, e.found_at, e.poi_id, e.trip_id, e.source, e.encounter_id, p.name AS poi_name
  FROM collection_entries e LEFT JOIN pois p ON p.id = e.poi_id
  WHERE e.user_id = ? AND e.critter_id = ? ORDER BY e.found_at`;
export const MY_ENTRIES_TABLES = ['collection_entries', 'pois'];

export const SKIN_SQL = `SELECT form_id FROM guide_skins WHERE user_id = ? AND guide_id = ?`;
export const SKIN_TABLES = ['guide_skins'];

export interface DetailForm {
  readonly id: string;
  readonly rarity: Rarity;
  readonly found: boolean;
  readonly requirement: string;
  readonly spec: FormSpec | null;
  /** The form's own name ("Temple Tokek"), from my verified find only. */
  readonly name: string | null;
  /** The form's own field note (a sentence), read out under the card in place of the critter's. */
  readonly note: string | null;
  readonly foundAt: string | null;
  readonly place: string | null;
}

export interface DetailModel {
  readonly critterId: string;
  readonly key: string;
  readonly no: number;
  readonly city: string;
  readonly seed: number;
  readonly note: string | null;
  /** The critter's own name, once any of its forms is verified. */
  readonly name: string | null;
  readonly forms: readonly DetailForm[];
  readonly foundCount: number;
  /** The guide this critter is (its look can be changed), or null for a local. */
  readonly guide: { readonly id: string; readonly name: string } | null;
}

export function buildDetail(
  critter: CritterDetailRow,
  forms: readonly DetailFormRow[],
  entries: readonly EntryRow[],
): DetailModel {
  const verified = entries.filter((e) => e.verification === 'verified');
  const byForm = new Map(verified.map((e) => [e.form_id, e]));
  const list = [...forms]
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
    .map((form): DetailForm => {
      const entry = byForm.get(form.id);
      return {
        id: form.id,
        rarity: form.rarity,
        found: entry !== undefined,
        requirement: form.requirement_copy ?? '',
        spec: formSpec(form),
        name: entry?.form_name ?? entry?.critter_name ?? null,
        note: form.note,
        foundAt: entry?.found_at ?? null,
        place: entry?.poi_name ?? null,
      };
    });
  const isGuide =
    critter.guide_id !== null &&
    critter.guide_name !== null &&
    critter.key === critter.hero_critter_key;
  return {
    critterId: critter.id,
    key: critter.key,
    no: critter.no,
    city: critter.city ?? '',
    seed: critter.canonical_seed ?? critter.no,
    note: critter.note,
    name: verified.find((e) => e.critter_name !== null)?.critter_name ?? null,
    forms: list,
    foundCount: list.filter((f) => f.found).length,
    guide:
      isGuide && critter.guide_id !== null && critter.guide_name !== null
        ? { id: critter.guide_id, name: critter.guide_name }
        : null,
  };
}

/** The form a detail opens on: the rarest one found. */
export function initialForm(model: DetailModel): DetailForm | undefined {
  return [...model.forms].reverse().find((f) => f.found) ?? model.forms[0];
}
