import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import * as crew from '../src/enums/crew';
import * as plan from '../src/enums/plan';
import * as platform from '../src/enums/platform';
import * as trip from '../src/enums/trip';

interface EnumFixture {
  readonly name: string;
  readonly values: readonly string[];
  readonly schema: z.ZodType;
}

const fixtures: readonly EnumFixture[] = [
  { name: 'CrewMemberRole', values: crew.CREW_MEMBER_ROLES, schema: crew.crewMemberRoleSchema },
  {
    name: 'CrewMemberStatus',
    values: crew.CREW_MEMBER_STATUSES,
    schema: crew.crewMemberStatusSchema,
  },
  { name: 'TripStatus', values: trip.TRIP_STATUSES, schema: trip.tripStatusSchema },
  { name: 'TripPhase', values: trip.TRIP_PHASES, schema: trip.tripPhaseSchema },
  { name: 'TripSetupStep', values: trip.TRIP_SETUP_STEPS, schema: trip.tripSetupStepSchema },
  {
    name: 'TripParticipantRsvp',
    values: trip.TRIP_PARTICIPANT_RSVPS,
    schema: trip.tripParticipantRsvpSchema,
  },
  {
    name: 'ItineraryVersionVisibility',
    values: plan.ITINERARY_VERSION_VISIBILITIES,
    schema: plan.itineraryVersionVisibilitySchema,
  },
  {
    name: 'ItineraryVersionStatus',
    values: plan.ITINERARY_VERSION_STATUSES,
    schema: plan.itineraryVersionStatusSchema,
  },
  {
    name: 'PlanItemCostModel',
    values: plan.PLAN_ITEM_COST_MODELS,
    schema: plan.planItemCostModelSchema,
  },
  { name: 'CreatedByKind', values: plan.CREATED_BY_KINDS, schema: plan.createdByKindSchema },
  { name: 'ChangeSetStatus', values: plan.CHANGE_SET_STATUSES, schema: plan.changeSetStatusSchema },
  {
    name: 'ChangeSetTrigger',
    values: plan.CHANGE_SET_TRIGGERS,
    schema: plan.changeSetTriggerSchema,
  },
  { name: 'ChangeSetScope', values: plan.CHANGE_SET_SCOPES, schema: plan.changeSetScopeSchema },
  {
    name: 'ChangeSetApprovedByKind',
    values: plan.CHANGE_SET_APPROVED_BY_KINDS,
    schema: plan.changeSetApprovedByKindSchema,
  },
  {
    name: 'GuideActionStatus',
    values: plan.GUIDE_ACTION_STATUSES,
    schema: plan.guideActionStatusSchema,
  },
  {
    name: 'CmdResultStatus',
    values: platform.CMD_RESULT_STATUSES,
    schema: platform.cmdResultStatusSchema,
  },
  { name: 'RtOutboxKind', values: platform.RT_OUTBOX_KINDS, schema: platform.rtOutboxKindSchema },
  { name: 'ActorKind', values: platform.ACTOR_KINDS, schema: platform.actorKindSchema },
];

describe.each(fixtures)('$name', ({ values, schema }) => {
  it('has at least one value with no duplicates', () => {
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length);
  });

  it('accepts every documented value', () => {
    for (const value of values) {
      expect(schema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects a value outside the set', () => {
    expect(schema.safeParse('not-a-real-value')).toMatchObject({ success: false });
  });
});
