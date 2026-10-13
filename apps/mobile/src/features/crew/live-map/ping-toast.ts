import type { PingAllResult } from '@cp/domain';
import { t } from '@lingui/core/macro';

/** What the crew got, for the island toast. */
export function pingToast(result: PingAllResult, time: string | null): string {
  if (result.kind === 'on_my_way') {
    const minutes = result.eta_min;
    return minutes === null
      ? t({ id: 'liveMap.toast.onMyWay', message: 'The crew can see you coming.' })
      : t({
          id: 'liveMap.toast.onMyWayEta',
          message: `The crew can see you coming. ${minutes} minutes.`,
        });
  }
  const place = result.place_name;
  return place === null || time === null
    ? t({ id: 'liveMap.toast.pinged', message: 'Pinged everyone.' })
    : t({ id: 'liveMap.toast.pingedMeetup', message: `Pinged everyone: ${place} at ${time}.` });
}
