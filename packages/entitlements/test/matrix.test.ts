/**
 * One row per line of docs/product-decisions.md's final entitlement matrix, asserted against six
 * canonical source combinations (Free, Pass+, Boost, FTF, crew-yearly buyer, crew-yearly member —
 * the matrix's "crew yearly" column splits into two scenarios because several rows differ between
 * the buyer and a non-buyer member).
 */
import { describe, expect, it } from 'vitest';

import { resolveTripCapabilities, resolveUserCapabilities } from '../src/capabilities';
import { boostActive, guideUnlimited, passPlus, sponsored } from '../src/resolve';
import { type Clock, type EntitlementSource } from '../src/sources';

const USER = 'user-1';
const BUYER = 'buyer-1';
const TRIP = 'trip-1';
const CREW = 'crew-1';
const NOW: Clock = { now: () => new Date('2026-06-15T00:00:00Z') };

const FREE: readonly EntitlementSource[] = [];
const PASS_PLUS: readonly EntitlementSource[] = [
  { kind: 'store_sub', status: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z' },
];
const BOOST: readonly EntitlementSource[] = [
  {
    kind: 'trip_boost',
    tripId: TRIP,
    startsAt: '2026-06-01T00:00:00Z',
    endsAt: '2026-07-01T00:00:00Z',
    status: 'active',
  },
];
const FTF: readonly EntitlementSource[] = [
  {
    kind: 'ftf',
    crewId: CREW,
    tripId: TRIP,
    startsAt: '2026-06-01T00:00:00Z',
    endsAt: '2026-07-01T00:00:00Z',
  },
];
const CREW_YEAR_BUYER: readonly EntitlementSource[] = [
  {
    kind: 'crew_year',
    crewId: CREW,
    buyerUserId: USER,
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
  },
];
const CREW_YEAR_MEMBER: readonly EntitlementSource[] = [
  {
    kind: 'crew_year',
    crewId: CREW,
    buyerUserId: BUYER,
    validFrom: '2026-01-01T00:00:00Z',
    validTo: '2027-01-01T00:00:00Z',
  },
];

interface MatrixRow {
  readonly capability: string;
  readonly resolve: (sources: readonly EntitlementSource[]) => boolean | number;
  readonly free: boolean | number;
  readonly passPlus: boolean | number;
  readonly boost: boolean | number;
  readonly ftf: boolean | number;
  readonly crewYearBuyer: boolean | number;
  readonly crewYearMember: boolean | number;
}

const MATRIX: readonly MatrixRow[] = [
  {
    capability: 'Guide 1:1 text + voice + camera (one meter): unlimited',
    resolve: (s) => guideUnlimited(passPlus(s, USER, NOW), boostActive(s, TRIP, CREW, NOW)),
    free: false,
    passPlus: true,
    boost: true,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: true,
  },
  {
    capability: 'Redrafts per trip (crew-wide)',
    resolve: (s) => resolveTripCapabilities(s, TRIP, CREW, NOW).redraftLimit,
    free: 3,
    passPlus: 3,
    boost: Infinity,
    ftf: Infinity,
    crewYearBuyer: Infinity,
    crewYearMember: Infinity,
  },
  {
    capability: 'Seats per trip',
    resolve: (s) => resolveTripCapabilities(s, TRIP, CREW, NOW).seatCap,
    free: 6,
    passPlus: 6,
    boost: 16,
    ftf: 16,
    crewYearBuyer: 16,
    crewYearMember: 16,
  },
  {
    capability: 'Live crew map, ETAs, meet-up, PING ALL, crew LA, crew widget',
    resolve: (s) => resolveTripCapabilities(s, TRIP, CREW, NOW).liveMap,
    free: false,
    passPlus: false,
    boost: true,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: true,
  },
  {
    capability: 'NEXT FLIGHT widget',
    resolve: (s) => resolveUserCapabilities(s, USER, NOW).nextFlightWidget,
    free: false,
    passPlus: true,
    boost: false,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: false,
  },
  {
    capability: 'Mailbox auto-scan import',
    resolve: (s) => resolveUserCapabilities(s, USER, NOW).mailboxImport,
    free: false,
    passPlus: true,
    boost: false,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: false,
  },
  {
    capability: 'Spoken read-out of notifications + roundup',
    resolve: (s) => resolveUserCapabilities(s, USER, NOW).spokenReadout,
    free: false,
    passPlus: true,
    boost: false,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: false,
  },
  {
    capability: 'Printed postcard (sender)',
    resolve: (s) => resolveUserCapabilities(s, USER, NOW).printedPostcardSender,
    free: false,
    passPlus: true,
    boost: false,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: false,
  },
  {
    capability: 'App icon styles: all styles (vs default + free alternates)',
    resolve: (s) => resolveUserCapabilities(s, USER, NOW).iconStylesAll,
    free: false,
    passPlus: true,
    boost: false,
    ftf: true,
    crewYearBuyer: true,
    crewYearMember: false,
  },
  {
    capability: 'Sponsored picks shown',
    resolve: (s) => sponsored(passPlus(s, USER, NOW), boostActive(s, TRIP, CREW, NOW)),
    free: true,
    passPlus: false,
    boost: false,
    ftf: false,
    crewYearBuyer: false,
    crewYearMember: false,
  },
];

describe('final entitlement matrix', () => {
  it.each(MATRIX)('$capability', (row) => {
    expect(row.resolve(FREE)).toBe(row.free);
    expect(row.resolve(PASS_PLUS)).toBe(row.passPlus);
    expect(row.resolve(BOOST)).toBe(row.boost);
    expect(row.resolve(FTF)).toBe(row.ftf);
    expect(row.resolve(CREW_YEAR_BUYER)).toBe(row.crewYearBuyer);
    expect(row.resolve(CREW_YEAR_MEMBER)).toBe(row.crewYearMember);
  });

  it('covers every row this suite is meant to prove (guards against an accidentally-empty matrix)', () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(10);
  });
});

// Voting, planning, splitting money, offline maps/plan, notifications, community, every critter and
// sticker, SOS + Help/SOS map, flight tracking, forward/paste/scan imports, disruption fixes,
// forecast watch, rerouting, leave-by LA + alarm + crew pips, and earned critter icons/avatars are
// unconditionally available wherever a screen reads them directly: this engine deliberately exposes
// no function that could gate any of them, so there is nothing here for a matrix row to cover.
