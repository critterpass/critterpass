/**
 * The crew-live (meet-up) Live Activity (5a-2), a Boost perk: the whole crew on one line sliding
 * toward the meet-up flag. A member's place on the line is their ETA bucketed into ten steps (never
 * a coordinate); the two furthest out get a row with their own status line. One ContentState per
 * meet-up, sent on its broadcast channel.
 */
import { z } from 'zod';

import {
  laLine,
  laMemberHash,
  memberHashSchema,
  unixSeconds,
  unixSecondsSchema,
} from './la-common';

export const LA_MEET_UP_STATES = ['gathering', 'close', 'arrived', 'late', 'ended'] as const;
export type LaMeetUpState = (typeof LA_MEET_UP_STATES)[number];

/** Why a meet-up activity ended, for its final frame. */
export const LA_MEET_UP_END_REASONS = [
  'all_arrived',
  'timed_out',
  'boost_ended',
  'cancelled',
] as const;

/** Push-to-start this long before the meet-up. */
export const LA_MEET_UP_LEAD_MS = 30 * 60_000;
/** The activity ends itself this long after the meet-up time. */
export const LA_MEET_UP_TAIL_MS = 30 * 60_000;
/** ETAs at or beyond this sit at the far end of the line. */
export const LA_MEET_UP_HORIZON_MIN = 45;
export const LA_MEET_UP_STEPS = 10;
export const LA_MEET_UP_MAX_MEMBERS = 16;

export const meetUpLaAttributesSchema = z.object({
  trip_id: z.uuid(),
  meetup_id: z.uuid(),
  place_name: z.string().max(40),
  meet_at: unixSecondsSchema,
});
export type MeetUpLaAttributes = z.infer<typeof meetUpLaAttributesSchema>;

export const meetUpLaMemberSchema = z.object({
  uid_hash: memberHashSchema,
  initial: z.string().max(2),
  /** Avatar colour slot (0–7) the app assigns the member. */
  tone: z.number().int().min(0).max(7),
  /** 0 = at the flag, 10 = furthest out. */
  step: z.number().int().min(0).max(LA_MEET_UP_STEPS),
  min: z.number().int().nonnegative().nullable(),
  arrived: z.boolean(),
});

export const meetUpLaStragglerSchema = z.object({
  name: z.string().max(24),
  initial: z.string().max(2),
  tone: z.number().int().min(0).max(7),
  /** "Scooter · 2 km · 8 min". */
  line: z.string().max(48),
});

export const meetUpLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(LA_MEET_UP_STATES),
  /** The furthest member's ETA (the headline "22 min"). */
  eta_min: z.number().int().nonnegative().nullable(),
  all_under_5: z.boolean(),
  members: z.array(meetUpLaMemberSchema).max(LA_MEET_UP_MAX_MEMBERS),
  stragglers: z.array(meetUpLaStragglerSchema).max(2),
  end_reason: z.enum(LA_MEET_UP_END_REASONS).nullable(),
});
export type MeetUpLaState = z.infer<typeof meetUpLaStateSchema>;

export interface MeetUpLaMember {
  readonly uid: string;
  readonly name: string;
  readonly tone: number;
  readonly etaMin: number | null;
  readonly arrived: boolean;
  /** Mode, distance and ETA as the crew map words them ("Scooter · 2 km"). */
  readonly statusText: string | null;
}

export interface MeetUpLaInput {
  readonly meetupId: string;
  readonly tripId: string;
  readonly placeName: string;
  readonly meetAt: Date;
  readonly members: readonly MeetUpLaMember[];
  readonly endReason: (typeof LA_MEET_UP_END_REASONS)[number] | null;
}

export function buildMeetUpLaAttributes(input: MeetUpLaInput): MeetUpLaAttributes {
  return {
    trip_id: input.tripId,
    meetup_id: input.meetupId,
    place_name: laLine(input.placeName, 40),
    meet_at: unixSeconds(input.meetAt),
  };
}

function initialOf(name: string): string {
  return ([...name.trim()][0] ?? '?').toUpperCase();
}

function stepOf(member: MeetUpLaMember): number {
  if (member.arrived) return 0;
  if (member.etaMin === null) return LA_MEET_UP_STEPS;
  const fraction = Math.min(1, Math.max(0, member.etaMin / LA_MEET_UP_HORIZON_MIN));
  return Math.max(1, Math.round(fraction * LA_MEET_UP_STEPS));
}

export function meetUpLaPhase(input: MeetUpLaInput, now: Date): LaMeetUpState {
  if (input.endReason !== null) return 'ended';
  const out = input.members.filter((m) => !m.arrived);
  if (out.length === 0) return 'arrived';
  const late = now.getTime() > input.meetAt.getTime();
  const worst = Math.max(...out.map((m) => m.etaMin ?? LA_MEET_UP_HORIZON_MIN));
  if (late) return 'late';
  return worst <= 5 ? 'close' : 'gathering';
}

export function buildMeetUpLaState(input: MeetUpLaInput, now: Date, seq: number): MeetUpLaState {
  const members = input.members.slice(0, LA_MEET_UP_MAX_MEMBERS);
  const out = members
    .filter((m) => !m.arrived)
    .sort((a, b) => (b.etaMin ?? Number.MAX_SAFE_INTEGER) - (a.etaMin ?? Number.MAX_SAFE_INTEGER));
  const worst = out[0];
  return {
    seq,
    state: meetUpLaPhase(input, now),
    eta_min: worst?.etaMin ?? null,
    all_under_5: out.every((m) => m.etaMin !== null && m.etaMin <= 5),
    members: members.map((m) => ({
      uid_hash: laMemberHash(input.meetupId, m.uid),
      initial: initialOf(m.name),
      tone: m.tone,
      step: stepOf(m),
      min: m.etaMin,
      arrived: m.arrived,
    })),
    stragglers: out.slice(0, 2).map((m) => ({
      name: laLine(m.name, 24),
      initial: initialOf(m.name),
      tone: m.tone,
      line: laLine(
        [m.statusText, m.etaMin === null ? null : `${m.etaMin} min`]
          .filter((part): part is string => part !== null && part !== '')
          .join(' · '),
        48,
      ),
    })),
    end_reason: input.endReason,
  };
}
