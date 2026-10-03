/**
 * The points of the places today's open quests name (see `quest-places.ts`): the phone's own rows
 * first, a fetched copy for a place it has none of, re-read on the minute tick so a quest that
 * closes stops being watched.
 */
import { toLocalWallTime } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import type { PlanPoiRow } from './bridge-inputs';
import {
  createQuestPlaceStore,
  openQuestPlaces,
  QUEST_ITEM_TABLES,
  QUEST_POI_TABLES,
  QUEST_TABLES,
  questItemSql,
  questPoiSql,
  questSql,
  type PlaceFetcher,
  type QuestRow,
} from './quest-places';
import { useRows, type RowWatcher } from './use-rows';

export interface QuestPlacesDeps {
  readonly watch: RowWatcher;
  readonly tripId: string | null;
  readonly tz: string;
  readonly now: () => number;
  /** Changes every minute: quests close and days turn on the clock. */
  readonly tick: number;
  readonly fetchPlace?: PlaceFetcher;
}

export function useQuestPlaces(deps: QuestPlacesDeps): readonly PlanPoiRow[] {
  const { watch, tripId, tz, now, tick, fetchPlace } = deps;
  const questRows = useRows<QuestRow>(watch, tripId ? questSql(tripId) : null, QUEST_TABLES);
  const refs = useMemo(
    () => openQuestPlaces(questRows, now(), tz),
    // `tick` re-reads which quests are still open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questRows, tz, tick],
  );
  const itemRows = useRows<{ poi_id: string }>(
    watch,
    questItemSql(refs.planItemIds),
    QUEST_ITEM_TABLES,
  );
  const key = [...new Set([...refs.poiIds, ...itemRows.map((row) => row.poi_id)])].sort().join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',')), [key]);
  const local = useRows<PlanPoiRow>(watch, questPoiSql(ids), QUEST_POI_TABLES);
  const day = toLocalWallTime(new Date(now()), tz).date;
  const [store] = useState(() => (fetchPlace ? createQuestPlaceStore(fetchPlace, now) : null));
  const [landed, setLanded] = useState(0);

  useEffect(() => {
    if (store === null || ids.length === 0) return;
    void store.fill(ids, local, day).then((any) => {
      if (any) setLanded((n) => n + 1);
    });
    // `tick` retries a fetch that failed while offline.
  }, [store, ids, local, day, tick]);

  return useMemo(
    () => (store === null ? local : store.resolve(ids, local, day)),
    // `landed` re-reads the store once a fetched copy arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, ids, local, day, landed],
  );
}
