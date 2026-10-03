/**
 * The feature queue tables the catalogue (./catalogue.ts) merges: each feature declares its
 * queues, policies and descriptions in its own `<area>/queues.ts` and adds one line here.
 */
import type { QueueSpec } from './catalogue';
import { MONEY_QUEUE_DESCRIPTIONS, moneyQueueSpecs } from '../money/queues';
import { BOOKINGS_QUEUE_DESCRIPTIONS, bookingsQueueSpecs } from '../bookings/queues';
import { SETUP_QUEUE_DESCRIPTIONS, setupQueueSpecs } from '../setup/queues';
import { DRAFT_QUEUE_DESCRIPTIONS, draftQueueSpecs } from '../itinerary/queues';
import { BILLING_QUEUE_DESCRIPTIONS, billingQueueSpecs } from '../billing/queues';
import { GUIDE_QUEUE_DESCRIPTIONS, guideQueueSpecs } from '../guide/queues';
import { SUPPLIER_QUEUE_DESCRIPTIONS, supplierQueueSpecs } from '../suppliers/queues';
import { TRIP_DAY_QUEUE_DESCRIPTIONS, tripDayQueueSpecs } from '../trip-day/queues';
import { DISRUPTION_QUEUE_DESCRIPTIONS, disruptionQueueSpecs } from '../disruptions/queues';
import { ACCOUNT_QUEUE_DESCRIPTIONS, accountQueueSpecs } from '../account/queues';
import { EXPLORE_QUEUE_DESCRIPTIONS, exploreQueueSpecs } from '../explore/queues';
import { PROPOSAL_QUEUE_DESCRIPTIONS, proposalQueueSpecs } from '../proposal/queues';
import { CRITTER_QUEUE_DESCRIPTIONS, critterQueueSpecs } from '../critters/queues';
import { MEDIA_QUEUE_DESCRIPTIONS, mediaQueueSpecs } from '../media/queues';
import { QUEST_QUEUE_DESCRIPTIONS, questQueueSpecs } from '../quests/queues';
import { TRIP_LIFECYCLE_QUEUE_DESCRIPTIONS, tripLifecycleQueueSpecs } from '../trips/lifecycle';
import { LA_QUEUE_DESCRIPTIONS, laQueueSpecs } from '../surfaces/la-queues';
import { SAFETY_QUEUE_DESCRIPTIONS, safetyQueueSpecs } from '../safety/queues';
import { WIDGET_QUEUE_DESCRIPTIONS, widgetQueueSpecs } from '../surfaces/widget-refresh';
import { RECAP_QUEUE_DESCRIPTIONS, recapQueueSpecs } from '../recap/queues';
import { ALBUM_QUEUE_DESCRIPTIONS, albumQueueSpecs } from '../album/queues';
import { PLACES_QUEUE_DESCRIPTIONS, placesQueueSpecs } from '../places/queues';
import { PLAN_QUEUE_DESCRIPTIONS, planQueueSpecs } from '../plan/queues';
import { PLANNING_QUEUE_DESCRIPTIONS, planningQueueSpecs } from '../planning/queues';
import {
  HOURS_RESEARCH_QUEUE_DESCRIPTIONS,
  hoursResearchQueueSpecs,
} from '../places/hours-research';

export function featureQueueSpecs(defaults: QueueSpec) {
  return {
    ...moneyQueueSpecs(defaults),
    ...bookingsQueueSpecs(defaults),
    ...setupQueueSpecs(defaults),
    ...draftQueueSpecs(defaults),
    ...billingQueueSpecs(defaults),
    ...guideQueueSpecs(defaults),
    ...supplierQueueSpecs(defaults),
    ...tripDayQueueSpecs(defaults),
    ...disruptionQueueSpecs(defaults),
    ...accountQueueSpecs(defaults),
    ...exploreQueueSpecs(defaults),
    ...proposalQueueSpecs(defaults),
    ...critterQueueSpecs(defaults),
    ...mediaQueueSpecs(defaults),
    ...questQueueSpecs(defaults),
    ...tripLifecycleQueueSpecs(defaults),
    ...laQueueSpecs(defaults),
    ...safetyQueueSpecs(defaults),
    ...widgetQueueSpecs(defaults),
    ...recapQueueSpecs(defaults),
    ...albumQueueSpecs(defaults),
    ...placesQueueSpecs(defaults),
    ...hoursResearchQueueSpecs(defaults),
    ...planQueueSpecs(defaults),
    ...planningQueueSpecs(defaults),
  } as const;
}

export const FEATURE_QUEUE_DESCRIPTIONS = {
  ...MONEY_QUEUE_DESCRIPTIONS,
  ...BOOKINGS_QUEUE_DESCRIPTIONS,
  ...SETUP_QUEUE_DESCRIPTIONS,
  ...DRAFT_QUEUE_DESCRIPTIONS,
  ...BILLING_QUEUE_DESCRIPTIONS,
  ...GUIDE_QUEUE_DESCRIPTIONS,
  ...SUPPLIER_QUEUE_DESCRIPTIONS,
  ...TRIP_DAY_QUEUE_DESCRIPTIONS,
  ...DISRUPTION_QUEUE_DESCRIPTIONS,
  ...ACCOUNT_QUEUE_DESCRIPTIONS,
  ...EXPLORE_QUEUE_DESCRIPTIONS,
  ...PROPOSAL_QUEUE_DESCRIPTIONS,
  ...CRITTER_QUEUE_DESCRIPTIONS,
  ...MEDIA_QUEUE_DESCRIPTIONS,
  ...QUEST_QUEUE_DESCRIPTIONS,
  ...TRIP_LIFECYCLE_QUEUE_DESCRIPTIONS,
  ...LA_QUEUE_DESCRIPTIONS,
  ...SAFETY_QUEUE_DESCRIPTIONS,
  ...WIDGET_QUEUE_DESCRIPTIONS,
  ...RECAP_QUEUE_DESCRIPTIONS,
  ...ALBUM_QUEUE_DESCRIPTIONS,
  ...PLACES_QUEUE_DESCRIPTIONS,
  ...HOURS_RESEARCH_QUEUE_DESCRIPTIONS,
  ...PLAN_QUEUE_DESCRIPTIONS,
  ...PLANNING_QUEUE_DESCRIPTIONS,
} as const;
