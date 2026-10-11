/** The stop sheet's ways out: the maps app, and the crew's open suggestion on the stop. */
import { Linking } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import type { TripPlan } from '@/data/plan/use-trip-plan';

import { mapsUrl } from './routes';

export function openInMaps(item: DayItem): void {
  if (item.place === null) return;
  void Linking.openURL(mapsUrl(item.title, item.place.lat, item.place.lng));
}

/** The open change set that touches `stableId`, if the crew is still deciding on one. */
export function openSuggestion(plan: TripPlan, stableId: string): string | null {
  for (const set of plan.openChangesets) {
    if (set.ops?.includes(`"${stableId}"`) === true) return set.id;
  }
  return null;
}
