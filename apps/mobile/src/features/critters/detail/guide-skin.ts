/**
 * The guide's look: an owned form of the guide's own critter replaces its sticker wherever the
 * guide appears (`guide_skins`, through `set_guide_skin`); null is the canonical look. A change
 * shows at once, before the row syncs back, and the guide's colour always stays canonical.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { FormSpec } from '@cp/critter-art';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { setGuideSkinCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import type { FormRow } from '../data/queries';
import { formSpec } from '../dex/dex-model';

/** Changes made on this phone that haven't synced back yet, by guide id. */
const pending = new Map<string, string | null>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SKIN_BY_SLUG_SQL = `SELECT s.guide_id, s.form_id, f.rarity, f.palette, f.pose, f.edge
  FROM guide_skins s JOIN guides g ON g.id = s.guide_id
  LEFT JOIN critter_forms f ON f.id = s.form_id
  WHERE s.user_id = ? AND g.slug = ?`;
const SKIN_BY_SLUG_TABLES = ['guide_skins', 'guides', 'critter_forms'];
const FORM_SQL = `SELECT id, rarity, palette, pose, edge FROM critter_forms WHERE id = ?`;
const GUIDE_SQL = `SELECT id FROM guides WHERE slug = ?`;

interface SkinRow {
  readonly guide_id: string;
  readonly form_id: string | null;
  readonly rarity: FormRow['rarity'] | null;
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
}

function specOf(row: Pick<SkinRow, 'rarity' | 'palette' | 'pose' | 'edge'> & { id?: string }) {
  if (row.rarity === null) return null;
  return formSpec({
    id: row.id ?? '',
    key: null,
    critter_id: '',
    rarity: row.rarity,
    palette: row.palette,
    pose: row.pose,
    edge: row.edge,
    requirement_copy: null,
    xp: null,
  });
}

/**
 * The form the guide wears for the signed-in traveller (`guideSlug`, e.g. `tokek`): null for its
 * canonical look. Other areas pass it to the guide's sticker as `form`.
 */
export function useGuideSkin(guideSlug: string): FormSpec | null {
  const uid = useOwnerUid();
  useSyncExternalStore(subscribe, () => version);
  const synced = useLiveRows<SkinRow>(
    SKIN_BY_SLUG_SQL,
    uid === null ? null : [uid, guideSlug],
    SKIN_BY_SLUG_TABLES,
  ).rows[0];
  const guide = useLiveRows<{ id: string }>(GUIDE_SQL, [guideSlug], ['guides']).rows[0];
  const override = guide === undefined ? undefined : pending.get(guide.id);
  const overrideForm = useLiveRows<SkinRow & { id: string }>(
    FORM_SQL,
    typeof override === 'string' ? [override] : null,
    ['critter_forms'],
  ).rows[0];
  if (override === null) return null;
  if (typeof override === 'string') return overrideForm === undefined ? null : specOf(overrideForm);
  return synced === undefined ? null : specOf(synced);
}

/** The form id the guide wears (pending change first), and a setter that queues the command. */
export function useGuideSkinControl(guideId: string | null) {
  const uid = useOwnerUid();
  useSyncExternalStore(subscribe, () => version);
  const { rows } = useLiveRows<{ form_id: string | null }>(
    `SELECT form_id FROM guide_skins WHERE user_id = ? AND guide_id = ?`,
    uid === null || guideId === null ? null : [uid, guideId],
    ['guide_skins'],
  );
  const command = useCommand(setGuideSkinCommand);
  const synced = rows[0]?.form_id ?? null;
  const loaded = rows.length > 0;
  useEffect(() => {
    // The server's row caught up with the change made here: it is no longer pending.
    if (guideId !== null && loaded && pending.get(guideId) === synced) {
      pending.delete(guideId);
      notify();
    }
  }, [guideId, loaded, synced]);
  const current =
    guideId !== null && pending.has(guideId) ? (pending.get(guideId) ?? null) : synced;
  const send = command.send;
  const set = useCallback(
    (formId: string | null) => {
      if (guideId === null) return;
      pending.set(guideId, formId);
      notify();
      void send({ guide_id: guideId, form_id: formId });
    },
    [guideId, send],
  );
  return { current, set };
}
