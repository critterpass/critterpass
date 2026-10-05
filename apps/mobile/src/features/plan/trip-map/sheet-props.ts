/**
 * What the trip map draws, read once by the screen from the synced plan (or by the lab from a
 * fixture) and handed to the map and each of its sheets.
 */
import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';
import type { LegPaths } from '@/data/legs/version-leg-paths';
import type { PendingReview } from '@/data/plan/use-pending-reviews';
import type { PlanMember } from '@/data/plan/use-trip-plan';
import type { GuideId } from '@/ui/people/GuideLine';

import type { DayRoute } from './day-route';
import type { CuratedPlace } from './map-places';
import type { CheckCounts } from './sheet-copy';
import type { TripDay } from './trip-days';
import type { DraftStage } from './draft-stage';

export interface TripMapModel {
  readonly tripId: string;
  readonly destination: string | null;
  readonly destinationSlug: string | null;
  /** The crew's name, for the whole trip's header ("THE BALI SIX"). */
  readonly crewName: string | null;
  /** The trip's zone (day dates and stop times are local to it). */
  readonly tz: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** When the countdown ends: my first departure, else the trip's start. */
  readonly countdownTo: Date | null;
  readonly days: readonly TripDay[];
  /** The road each synced leg of the version follows, keyed `from>to`; absent draws straight. */
  readonly legPaths?: LegPaths;
  readonly members: readonly PlanMember[];
  readonly me: string | null;
  readonly organiser: boolean;
  /** The organiser's own draft, shown to them before the crew has a plan. */
  readonly draft: boolean;
  /** Where that draft is: hers to build, with the guide, or ready to review. */
  readonly draftStage?: DraftStage | undefined;
  readonly draftVersionId?: string | null | undefined;
  readonly readOnly: boolean;
  readonly guide: { readonly id: GuideId; readonly name: string };
  readonly check: CheckCounts;
  /** Saved, not in a day yet, not hidden by me. */
  readonly ideas: readonly TripIdeaView[];
  /** Saved places in a day already. */
  readonly placedCount: number;
  readonly curated: readonly CuratedPlace[];
  /** Places in the plan (never drawn as dots). */
  readonly planned: ReadonlySet<string>;
  readonly reviews: readonly PendingReview[];
  readonly regionUri: string | null;
  /** Nothing in the plan and nothing saved (7i-1). */
  readonly empty: boolean;
  /** The map's opening centre `[lng, lat]` when there is nothing to fit. */
  readonly center: readonly [number, number] | null;
  /** The clock the plan is read against (which day is today); the phone's when absent. */
  readonly now?: Date | undefined;
}

export interface TripMapSheetProps {
  readonly model: TripMapModel;
  readonly day: TripDay | null;
  readonly route: DayRoute;
  readonly onSelectDay: (dayNo: number) => void;
  /** Moves the sheet: ALL DAYS opens the whole trip, a day row opens that day at half. */
  readonly onSnap: (snap: 'peek' | 'half' | 'full') => void;
  readonly onOpenStop: (stableId: string) => void;
  readonly picked: string | null;
  readonly onShare: () => void;
}
