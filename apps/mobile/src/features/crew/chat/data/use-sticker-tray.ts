/**
 * The sticker tray: the member's Critterdex as stickers. One tab per critter they have met (its
 * most recent form, in every sticker pose), "Recent" for the stickers they sent last, the set's
 * critters not met yet as silhouettes (tapping one says where to meet it), and "N of M" across the
 * whole dex. Only forms the member has met can be sent; the server checks the same.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { STICKER_POSES, type StickerPose } from '@cp/domain';
import { useMemo } from 'react';

import { useQuietLiveRows } from '@/data/powersync/live-rows';

export interface TrayForm {
  readonly formId: string;
  readonly critterId: string;
  readonly critterKey: string;
  readonly no: number;
  readonly name: string;
  readonly rarity: string;
  readonly palette: string | null;
  readonly seed: number | null;
  readonly setId: string | null;
  readonly setName: string | null;
  readonly country: string | null;
}

export interface TrayLocked {
  readonly critterId: string;
  readonly critterKey: string;
  readonly no: number;
  readonly seed: number | null;
}

export interface TraySticker {
  readonly form: TrayForm;
  readonly pose: StickerPose;
}

export interface TrayTab {
  /** The critter this tab shows; its stickers are its latest form in every pose. */
  readonly form: TrayForm;
  readonly stickers: readonly TraySticker[];
  /** The critters of the same set the member has not met yet. */
  readonly locked: readonly TrayLocked[];
}

export interface StickerTray {
  readonly loaded: boolean;
  readonly recent: readonly TraySticker[];
  readonly tabs: readonly TrayTab[];
  readonly met: number;
  readonly total: number;
}

interface FormRow {
  readonly form_id: string;
  readonly critter_id: string;
  readonly critter_key: string;
  readonly no: number;
  readonly name: string | null;
  readonly species: string;
  readonly rarity: string;
  readonly palette: string | null;
  readonly seed: number | null;
  readonly set_id: string | null;
  readonly set_name: string | null;
  readonly country: string | null;
}

interface CritterRow {
  readonly id: string;
  readonly key: string;
  readonly no: number;
  readonly seed: number | null;
  readonly set_id: string | null;
}

interface RecentRow {
  readonly form_id: string;
  readonly pose: string;
}

const MET_SQL = `SELECT e.form_id, c.id AS critter_id, c.key AS critter_key, c.no, e.critter_name AS name,
    c.species, f.rarity, f.palette, c.canonical_seed AS seed, c.set_id, s.name AS set_name, s.country
  FROM collection_entries e
  JOIN critter_forms f ON f.id = e.form_id
  JOIN critters c ON c.id = e.critter_id
  LEFT JOIN critter_sets s ON s.id = c.set_id
  WHERE e.user_id = ?
  ORDER BY e.found_at DESC, e.form_id`;

const CRITTERS_SQL = `SELECT id, key, no, canonical_seed AS seed, set_id FROM critters ORDER BY no`;

const RECENT_SQL = `SELECT ref_id AS form_id, body AS pose FROM messages
  WHERE sender_id = ? AND type = 'sticker' AND deleted_at IS NULL AND ref_id IS NOT NULL
  ORDER BY created_at DESC LIMIT 60`;

const RECENT_MAX = 8;

function isPose(value: string): value is StickerPose {
  return (STICKER_POSES as readonly string[]).includes(value);
}

/** The tray from its three reads; pure, so the rules are tested without a database. */
export function buildStickerTray(
  metRows: readonly FormRow[],
  critterRows: readonly CritterRow[],
  recentRows: readonly RecentRow[],
): Omit<StickerTray, 'loaded'> {
  // Newest find first: a critter's tab wears the form the member found last.
  const latest = new Map<string, TrayForm>();
  const byForm = new Map<string, TrayForm>();
  for (const row of metRows) {
    const form: TrayForm = {
      formId: row.form_id,
      critterId: row.critter_id,
      critterKey: row.critter_key,
      no: Number(row.no),
      name: row.name ?? row.species,
      rarity: row.rarity,
      palette: row.palette,
      seed: row.seed === null ? null : Number(row.seed),
      setId: row.set_id,
      setName: row.set_name,
      country: row.country,
    };
    byForm.set(form.formId, form);
    if (!latest.has(form.critterId)) latest.set(form.critterId, form);
  }
  const metCritters = new Set(latest.keys());
  const tabs = [...latest.values()].map((form): TrayTab => ({
    form,
    stickers: STICKER_POSES.map((pose) => ({ form, pose })),
    locked: critterRows
      .filter((critter) => critter.set_id === form.setId && !metCritters.has(critter.id))
      .map((critter) => ({
        critterId: critter.id,
        critterKey: critter.key,
        no: Number(critter.no),
        seed: critter.seed === null ? null : Number(critter.seed),
      })),
  }));
  const seen = new Set<string>();
  const recent: TraySticker[] = [];
  for (const row of recentRows) {
    const form = byForm.get(row.form_id);
    const key = `${row.form_id}:${row.pose}`;
    if (form === undefined || !isPose(row.pose) || seen.has(key)) continue;
    seen.add(key);
    recent.push({ form, pose: row.pose });
    if (recent.length === RECENT_MAX) break;
  }
  return { recent, tabs, met: metCritters.size, total: critterRows.length };
}

export function useStickerTray(me: string | null): StickerTray {
  const met = useQuietLiveRows<FormRow>(MET_SQL, me === null ? null : [me], [
    'collection_entries',
    'critter_forms',
    'critters',
    'critter_sets',
  ]);
  const critters = useQuietLiveRows<CritterRow>(CRITTERS_SQL, [], ['critters']);
  const recent = useQuietLiveRows<RecentRow>(RECENT_SQL, me === null ? null : [me], ['messages']);
  return useMemo(
    () => ({
      loaded: met.loaded && critters.loaded,
      ...buildStickerTray(met.rows, critters.rows, recent.rows),
    }),
    [met, critters, recent],
  );
}
