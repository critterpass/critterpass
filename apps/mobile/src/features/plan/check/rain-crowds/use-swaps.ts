/** Rain and crowds' swaps for one day as ticked choices (./swap-choices), read from the server. */
import { useCallback, useMemo, useState } from 'react';

import { fixerPaths, readSwaps, useFixerRead } from '../data/fixer-api';
import { mergeSwaps, tickedOps, toggled, weatherTurnedDown } from './swap-choices';

export type { SwapChoice } from './swap-choices';

export function useSwaps(
  tripId: string,
  dayId: string,
  version: string | null,
  clock: (instant: string) => string,
) {
  const path = useMemo(() => fixerPaths.swaps(tripId, dayId), [tripId, dayId]);
  const read = useFixerRead(path, version, readSwaps);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const choices = useMemo(
    () => (read.data === null ? [] : mergeSwaps(read.data, clock)),
    [clock, read.data],
  );
  const toggle = useCallback(
    (stableId: string) => setUnticked((current) => toggled(choices, current, stableId)),
    [choices],
  );
  return {
    answer: read.data,
    status: read.status,
    choices,
    unticked,
    toggle,
    ops: tickedOps(choices, unticked),
    turnDownWeather: weatherTurnedDown(choices, unticked),
  };
}
