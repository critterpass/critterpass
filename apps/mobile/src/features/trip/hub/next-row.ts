/**
 * The hub's compact row (3k-1): what comes next in this phase under the header (the first day and
 * its pack list before the trip, my flight on a travel day, today's leave-by or next stop during
 * it) and the way into Explore under the tiles.
 */
import type { DoodleName } from '@/ui/premium/icons/doodles/generated';

export interface HubNext {
  readonly icon: DoodleName;
  /** "First day · Oct 21", "Tomorrow · 10:00": what it is and when. */
  readonly label: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly tone: 'raised' | 'pink';
  readonly testID: string;
  readonly onPress: () => void;
}
