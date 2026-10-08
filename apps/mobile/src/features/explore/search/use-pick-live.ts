/**
 * Picking a "More places" row: the api is asked for the storable place behind it. The row waits
 * while it answers (a second tap does nothing), a ready place opens, and every other answer says
 * why nothing opened.
 */
import { t } from '@lingui/core/macro';
import { useCallback, useRef, useState } from 'react';

import { resolveLivePlace, type GetPlaceJson, type LivePlace } from '@/data/places/more-places';
import { toast } from '@/motion/island-toast';

type Refusal = 'loading' | 'unavailable' | 'offline';

function refusalTitle(kind: Refusal): string {
  if (kind === 'loading') {
    return t({
      id: 'search.more.gathering',
      message: 'Still gathering places here. Try again in a moment.',
    });
  }
  return kind === 'offline'
    ? t({ id: 'search.more.offline', message: 'No signal. Try again when you have some.' })
    : t({ id: 'search.more.unavailable', message: "That place can't be opened yet." });
}

export function usePickLive(input: {
  readonly getJson: GetPlaceJson;
  readonly destinationId: string | null;
  readonly onReady: (poiId: string) => void;
}): { readonly picking: string | null; readonly pick: (place: LivePlace) => void } {
  const { getJson, destinationId, onReady } = input;
  const [picking, setPicking] = useState<string | null>(null);
  const busy = useRef(false);
  const pick = useCallback(
    (place: LivePlace) => {
      if (destinationId === null || busy.current) return;
      busy.current = true;
      setPicking(place.fsqPlaceId);
      void resolveLivePlace(getJson, destinationId, place)
        .catch(() => ({ kind: 'unavailable' }) as const)
        .then((answer) => {
          busy.current = false;
          setPicking(null);
          if (answer.kind === 'ready') onReady(answer.poiId);
          else toast.show({ id: 'search-more-refused', title: refusalTitle(answer.kind) });
        });
    },
    [getJson, destinationId, onReady],
  );
  return { picking, pick };
}
