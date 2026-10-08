/**
 * Everything the PASS tab reads, as live local queries (so the Critterdex renders offline), plus
 * the crew's `crew_collection` hints: a crewmate's find or first spot shows as a toast the moment
 * it lands, before the counts row syncs.
 */
import {
  CRITTERS_RT,
  crewCollectionHintSchema,
  DEFAULT_ENCOUNTER_CONFIG,
  type LatLng,
} from '@cp/domain';
import { useMemo } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { getLocationEngine } from '@/lib/location';
import { toast } from '@/motion';

import { crewFindToast } from '../critters-copy';
import { recordSighting } from '../data/crew-sightings';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  CREW_COUNTS_SQL,
  CREW_COUNTS_TABLES,
  CRITTERS_SQL,
  CRITTERS_TABLES,
  ENTRIES_SQL,
  ENTRIES_TABLES,
  FORMS_SQL,
  FORMS_TABLES,
  ME_SQL,
  ME_TABLES,
  SET_CRITTERS_SQL,
  SET_FORMS_SQL,
  SET_FORMS_TABLES,
  SET_SQL,
  SETS_SQL,
  SETS_TABLES,
  TRIPS_SQL,
  TRIPS_TABLES,
  WINDOWS_SQL,
  WINDOWS_TABLES,
  type CrewCountRow,
  type CritterRow,
  type EntryRow,
  type FormRow,
  type MeRow,
  type SetRow,
  type TripRow,
  type WindowRow,
} from '../data/queries';
import {
  nearCritters,
  SPAWN_POIS_SQL,
  SPAWN_POIS_TABLES,
  SPAWNS_SQL,
  SPAWNS_TABLES,
  type SpawnPoiRow,
  type SpawnSqlRow,
} from '../data/spawn-rows';
import { buildDex, buildSet, type DexInput, type DexModel, type SetModel } from './dex-model';

export interface DexData {
  readonly loaded: boolean;
  readonly uid: string | null;
  readonly input: DexInput;
  readonly model: DexModel;
  readonly near: ReadonlySet<string>;
  readonly crewId: string | null;
}

function lastPosition(): LatLng | null {
  const fixes = getLocationEngine()?.recentFixes() ?? [];
  const last = fixes[fixes.length - 1];
  return last === undefined ? null : { lat: last.lat, lng: last.lng };
}

export function useDexRows(): DexData {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const sets = useLiveRows<SetRow>(SETS_SQL, [], SETS_TABLES);
  const critters = useLiveRows<CritterRow>(CRITTERS_SQL, [], CRITTERS_TABLES);
  const forms = useLiveRows<FormRow>(FORMS_SQL, [], FORMS_TABLES);
  const windows = useLiveRows<WindowRow>(WINDOWS_SQL, [], WINDOWS_TABLES);
  const entries = useLiveRows<EntryRow>(ENTRIES_SQL, mine, ENTRIES_TABLES);
  const me = useLiveRows<MeRow>(ME_SQL, mine, ME_TABLES);
  const trips = useLiveRows<TripRow>(TRIPS_SQL, mine, TRIPS_TABLES);
  const meRow = me.rows[0] ?? null;
  const crewId = meRow?.active_crew_id ?? trips.rows[0]?.crew_id ?? null;
  const counts = useLiveRows<CrewCountRow>(
    CREW_COUNTS_SQL,
    crewId === null || uid === null ? null : [crewId, uid],
    CREW_COUNTS_TABLES,
  );
  const spawns = useLiveRows<SpawnSqlRow>(SPAWNS_SQL, [], SPAWNS_TABLES);
  const pois = useLiveRows<SpawnPoiRow>(SPAWN_POIS_SQL, [], SPAWN_POIS_TABLES);

  const names = useMemo(
    () => new Map(counts.rows.map((row) => [row.user_id, row.display_name ?? ''])),
    [counts.rows],
  );
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a channel namespace, never copy.
  useChannel('crew_collection', crewId, {
    onEvent: (envelope) => {
      const hint = crewCollectionHintSchema.safeParse(envelope.data);
      if (!hint.success || hint.data.user_id === uid) return;
      const first = envelope.type === CRITTERS_RT.firstSpotter;
      if (!first && envelope.type !== CRITTERS_RT.befriended) return;
      recordSighting(hint.data.critter_id, names.get(hint.data.user_id) ?? '');
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast de-dupe key, never copy.
        id: `crew-find-${hint.data.entry_id}`,
        title: crewFindToast(names.get(hint.data.user_id) ?? '', first),
      });
    },
  });

  return useMemo(() => {
    const input: DexInput = {
      sets: sets.rows,
      critters: critters.rows,
      forms: forms.rows,
      entries: entries.rows,
      windows: windows.rows,
      trips: trips.rows,
      me: meRow,
      crewCounts: counts.rows,
    };
    const here = trips.rows.find((t) => t.status === 'in_trip') ?? trips.rows[0];
    const near = nearCritters({
      rules: spawns.rows,
      pois: new Map(pois.rows.map((p) => [p.id, p])),
      position: lastPosition(),
      destinationId: here?.destination_id ?? null,
      reachM: DEFAULT_ENCOUNTER_CONFIG.near_me_m,
    });
    return {
      loaded: sets.loaded && critters.loaded && entries.loaded,
      uid,
      input,
      model: buildDex(input),
      near,
      crewId,
    };
  }, [
    sets,
    critters,
    forms,
    entries,
    windows,
    trips.rows,
    meRow,
    counts.rows,
    spawns.rows,
    pois.rows,
    uid,
    crewId,
  ]);
}

export interface SetData {
  /** False until the set's own row has been read. */
  readonly loaded: boolean;
  /** Null once loaded when no such set is on this phone. */
  readonly set: SetModel | null;
}

/** One set's page: only that set's rows, and no crew channel of its own. */
export function useSet(setId: string): SetData {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const sets = useLiveRows<SetRow>(SET_SQL, [setId], SETS_TABLES);
  const critters = useLiveRows<CritterRow>(SET_CRITTERS_SQL, [setId], CRITTERS_TABLES);
  const forms = useLiveRows<FormRow>(SET_FORMS_SQL, [setId], SET_FORMS_TABLES);
  const windows = useLiveRows<WindowRow>(WINDOWS_SQL, [], WINDOWS_TABLES);
  const entries = useLiveRows<EntryRow>(ENTRIES_SQL, mine, ENTRIES_TABLES);
  const me = useLiveRows<MeRow>(ME_SQL, mine, ME_TABLES);
  const row = sets.rows[0];
  const meRow = me.rows[0] ?? null;
  return useMemo(
    () => ({
      loaded: sets.loaded && critters.loaded && entries.loaded,
      set:
        row === undefined
          ? null
          : buildSet(row, {
              critters: critters.rows,
              forms: forms.rows,
              entries: entries.rows,
              windows: windows.rows,
              me: meRow,
            }),
    }),
    [
      sets.loaded,
      critters.loaded,
      entries.loaded,
      row,
      critters.rows,
      forms.rows,
      entries.rows,
      windows.rows,
      meRow,
    ],
  );
}
