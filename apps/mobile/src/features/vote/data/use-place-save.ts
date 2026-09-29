/**
 * What a place page reads locally: whether this user saved the place (a queued save or unsave
 * shows at once, offline included) and the crews they could pitch it to.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { useLiveRows } from './live-rows';
import { savePlaceCommand, unsavePlaceCommand } from './vote-commands';

const SAVED_SQL = `SELECT
    (SELECT count(*) FROM saved_items WHERE user_id = ? AND kind = 'place' AND ref_id = ?) AS synced,
    (SELECT cmd FROM commands WHERE cmd IN ('save_place', 'unsave_place')
       AND json_extract(envelope, '$.payload.place_id') = ? ORDER BY seq DESC LIMIT 1) AS queued`;
const SAVED_TABLES = ['saved_items', 'commands'];

const CREWS_SQL = `SELECT c.id, c.name FROM crews c JOIN crew_members m ON m.crew_id = c.id
  WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at`;
const CREWS_TABLES = ['crews', 'crew_members'];

export interface CrewChoice {
  readonly id: string;
  readonly name: string;
}

export function usePlaceSave(placeId: string, me: string | null) {
  const { rows } = useLiveRows<{ synced: number; queued: string | null }>(
    SAVED_SQL,
    me === null ? null : [me, placeId, placeId],
    SAVED_TABLES,
  );
  const row = rows[0];
  const saved =
    row?.queued === 'save_place'
      ? true
      : row?.queued === 'unsave_place'
        ? false
        : Number(row?.synced ?? 0) > 0;
  const save = useCommand(savePlaceCommand);
  const unsave = useCommand(unsavePlaceCommand);
  const saveSend = save.send;
  const unsaveSend = unsave.send;
  const toggle = useCallback(async () => {
    if (saved) await unsaveSend({ place_id: placeId });
    else await saveSend({ place_id: placeId });
  }, [saved, placeId, saveSend, unsaveSend]);
  return { saved, toggle };
}

export function useMyCrews(me: string | null): readonly CrewChoice[] {
  const { rows } = useLiveRows<{ id: string; name: string | null }>(
    CREWS_SQL,
    me === null ? null : [me],
    CREWS_TABLES,
  );
  return rows.map((row) => ({ id: row.id, name: row.name ?? '' }));
}
