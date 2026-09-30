/**
 * The Kyoto six the setup renders show (3c-3…3c-10), as fixed facts for the developer scenes and
 * component tests: Winston organises; Jordan, Maya, Alex, Rin and Dev take part, in that join
 * order (so their member colours match the renders). No database, no network, a pinned clock.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data, never copy. */
import type { TripSetupStep } from '@cp/domain';

import type { SetupTrip } from '../data/setup-trip';
import type { ShellFrame } from '../shell/frame';
import { doneSteps, openableSteps, type WizardStep } from '../shell/steps';

export const TRIP_ID = '0199a6f0-0000-7000-8000-00000000c001';
export const JORDAN = '0199a6f0-0000-7000-8000-00000000a001';
export const MAYA = '0199a6f0-0000-7000-8000-00000000a002';
export const ALEX = '0199a6f0-0000-7000-8000-00000000a003';
export const RIN = '0199a6f0-0000-7000-8000-00000000a004';
export const DEV = '0199a6f0-0000-7000-8000-00000000a005';
export const WINSTON = '0199a6f0-0000-7000-8000-00000000a006';

/** 2026-10-02 09:41 in Kyoto. */
export const SCENE_NOW = Date.parse('2026-10-02T00:41:00Z');

export function kyotoTrip(
  options: { readonly step?: TripSetupStep; readonly me?: string; readonly dates?: boolean } = {},
): SetupTrip {
  const me = options.me ?? WINSTON;
  const people: [string, string][] = [
    [JORDAN, 'Jordan'],
    [MAYA, 'Maya'],
    [ALEX, 'Alex'],
    [RIN, 'Rin'],
    [DEV, 'Dev'],
    [WINSTON, 'Winston'],
  ];
  return {
    tripId: TRIP_ID,
    crewId: '0199a6f0-0000-7000-8000-00000000b001',
    status: 'setup',
    step: options.step ?? 'when',
    destinationName: 'Kyoto',
    guide: 'pon',
    startDate: options.dates === true ? '2027-04-02' : null,
    endDate: options.dates === true ? '2027-04-09' : null,
    tz: 'Asia/Tokyo',
    lengthDays: 8,
    currency: 'USD',
    seatCap: 6,
    isSolo: false,
    members: people.map(([uid, name], joinIndex) => ({
      uid,
      name,
      joinIndex,
      organiser: uid === WINSTON,
    })),
    me,
    isOrganiser: me === WINSTON,
    score: { won: 4, next: 2 },
  };
}

export function sceneFrame(
  trip: SetupTrip,
  viewing: WizardStep,
  options: { readonly offline?: boolean } = {},
): ShellFrame {
  return {
    destination: trip.destinationName,
    viewing,
    doneSteps: doneSteps(trip.step),
    openable: openableSteps(trip.step),
    onSelectStep: () => undefined,
    onBack: () => undefined,
    sync: {
      offline: options.offline === true,
      lastSyncedAt: options.offline === true ? new Date(SCENE_NOW - 3 * 3_600_000) : null,
      now: new Date(SCENE_NOW),
    },
  };
}
