/** The trip's drivers from the api, refetched when asked (after an answer, invite or cancel). */
import type { OurDrivers } from '@cp/domain';
import { useCallback, useEffect, useState } from 'react';

import { fetchOurDrivers } from './api';

export interface OurDriversState {
  readonly data: OurDrivers | null;
  readonly offline: boolean;
  readonly failed: boolean;
  readonly reload: () => void;
}

export function useOurDrivers(tripId: string): OurDriversState {
  const [data, setData] = useState<OurDrivers | null>(null);
  const [offline, setOffline] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    void fetchOurDrivers(tripId).then((outcome) => {
      if (!live) return;
      setOffline(outcome.kind === 'offline');
      setFailed(outcome.kind === 'error');
      if (outcome.kind === 'ok') setData(outcome.value);
    });
    return () => {
      live = false;
    };
  }, [tripId, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, offline, failed, reload };
}
