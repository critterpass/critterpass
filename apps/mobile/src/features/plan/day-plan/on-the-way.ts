/**
 * Saved places that sit on a day's route (7b-2 "ON THE WAY · +3 MIN"): the plan check's last fit
 * for each idea, for the plan version shown, says it fits that day between two stops with a
 * detour of a few minutes.
 */
import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';

export interface OnTheWay {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  /** Minutes the detour adds. */
  readonly minutes: number;
}

export function onTheWay(
  ideas: readonly TripIdeaView[],
  dayNo: number,
  versionId: string | null,
): OnTheWay[] {
  return ideas.flatMap((idea) => {
    const fit = idea.fit;
    if (fit === null || versionId === null || fit.version_id !== versionId) return [];
    const day = fit.days.find((entry) => entry.day_no === dayNo);
    const reason = day?.reasons.find((entry) => entry.code === 'on_the_way');
    if (reason?.code !== 'on_the_way') return [];
    return [{ id: idea.id, lat: idea.lat, lng: idea.lng, minutes: reason.params.detour_minutes }];
  });
}
