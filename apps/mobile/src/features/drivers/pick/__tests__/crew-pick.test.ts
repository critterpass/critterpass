/**
 * "Ask the crew first": the pick is drafted as one change the server accepts (the driver on the
 * picked days, never a TAKEN one), a refused pick is read for what went wrong, and the change card
 * names the driver, his days and the terms voted on.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { changeSetOpSchema, createChangesetPayloadSchema, type AgreedTerms } from '@cp/domain';
import { pickDays } from '@cp/planner';
import { i18n } from '@lingui/core';

import { crewPickChangeset, crewPickOp, pickErrorOf, quoteTerms } from '../crew-pick';
import {
  driverPickDetail,
  driverPickOf,
  driverPickTitle,
  pickDaysLine,
  pickErrorText,
  pickTermsLine,
} from '../pick-card';

const MADE = '0192f000-0000-7000-8000-0000000000d1';
const KETUT = '0192f000-0000-7000-8000-0000000000d2';
const TRIP = '0192f000-0000-7000-8000-00000000b001';
const VERSION = '0192f000-0000-7000-8000-00000000e001';
const SET = '0192f000-0000-7000-8000-00000000c001';

const days = pickDays(
  [
    {
      date: '2026-10-15',
      window: { start: '09:00', end: '17:00' },
      pickup: 'Sidemen',
      assignedProviderId: null,
    },
    {
      date: '2026-10-14',
      window: { start: '08:00', end: '18:00' },
      pickup: 'Ubud',
      assignedProviderId: null,
    },
    { date: '2026-10-16', window: null, pickup: null, assignedProviderId: KETUT },
  ],
  MADE,
  10,
);
const all = new Set(['2026-10-14', '2026-10-15', '2026-10-16']);
const quote: AgreedTerms = {
  price_minor: 80_000_000,
  currency: 'IDR',
  price_unit: 'day',
  included_hours: 10,
  includes: { fuel: 'yes', parking: 'yes', tolls: 'unknown', entry: 'no' },
  overtime_minor: null,
};

describe('asking the crew to pick a driver', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('drafts one change for the driver on the picked days, leaving out a taken day', () => {
    const op = crewPickOp(MADE, days, all);
    expect(op).toEqual({
      op: 'assign_provider',
      target: MADE,
      assignment: {
        days: [
          { date: '2026-10-15', window_start: '09:00', window_end: '17:00', pickup: 'Sidemen' },
          { date: '2026-10-14', window_start: '08:00', window_end: '18:00', pickup: 'Ubud' },
        ],
      },
      reason: 'driver_pick',
      affected_user_ids: [],
      booking_impact: false,
    });
    expect(changeSetOpSchema.safeParse(op).success).toBe(true);
    const payload = crewPickChangeset({
      changesetId: SET,
      tripId: TRIP,
      baseVersion: VERSION,
      op: op!,
    });
    expect(createChangesetPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('carries a quote as the terms voted on', () => {
    const op = crewPickOp(MADE, days, new Set(['2026-10-14']), quote);
    expect(op?.assignment?.terms).toEqual(quote);
    expect(changeSetOpSchema.safeParse(op).success).toBe(true);
  });

  it('turns a driver’s quote into the terms voted on, never guessing what he left unsaid', () => {
    const reply = {
      price_per_day_minor: 80_000_000,
      currency: 'IDR',
      includes: ['petrol', 'parking'],
      overtime_per_hour_minor: 10_000_000,
      included_hours: 10,
    };
    const terms = quoteTerms(reply);
    expect(terms).toEqual({
      price_minor: 80_000_000,
      currency: 'IDR',
      price_unit: 'day',
      included_hours: 10,
      includes: { fuel: 'yes', parking: 'yes', tolls: 'unknown', entry: 'unknown' },
      overtime_minor: 10_000_000,
    });
    const op = crewPickOp(MADE, days, new Set(['2026-10-14']), terms!);
    expect(changeSetOpSchema.safeParse(op).success).toBe(true);
    expect(quoteTerms({ ...reply, included_hours: 0 })?.included_hours).toBeNull();
    // A reply with tips but no price is no quote.
    expect(quoteTerms({ ...reply, price_per_day_minor: null })).toBeNull();
  });

  it('drafts nothing when no free day is picked', () => {
    expect(crewPickOp(MADE, days, new Set())).toBeNull();
    expect(crewPickOp(MADE, days, new Set(['2026-10-16']))).toBeNull();
  });

  it('reads why a pick was refused', () => {
    const rejected = (code: string, detail?: unknown) =>
      pickErrorOf({ kind: 'rejected', opId: 'op', code, detail });
    expect(pickErrorOf({ kind: 'applied', opId: 'op', result: {} })).toBeNull();
    expect(rejected('NOT_FOUND', { reason: 'provider' })).toEqual({ kind: 'driver_gone' });
    expect(rejected('VALIDATION', { reason: 'days' })).toEqual({ kind: 'days' });
    expect(
      rejected('STATE_INVALID', { reason: 'day_taken', dates: ['2026-10-15', 7, 'soon'] }),
    ).toEqual({ kind: 'day_taken', dates: ['2026-10-15'] });
    expect(rejected('PLAN_VERSION_CONFLICT', { latest: VERSION })).toEqual({ kind: 'plan_moved' });
    // Another refusal with the same code is not mistaken for one of these.
    expect(rejected('NOT_FOUND', { reason: 'trip' })).toEqual({ kind: 'failed' });
    expect(rejected('STATE_INVALID', { reason: 'nothing_accepted' })).toEqual({ kind: 'failed' });
    expect(rejected('FORBIDDEN')).toEqual({ kind: 'failed' });
    expect(pickErrorOf({ kind: 'unavailable', opId: 'op', code: 'NETWORK' })).toEqual({
      kind: 'needs_signal',
    });
  });

  it('names the days that went to another driver', () => {
    expect(pickErrorText({ kind: 'day_taken', dates: ['2026-10-15'] }, 'en')).toBe(
      'Thu 15 just went to another driver. Untick it and try again.',
    );
    expect(pickErrorText({ kind: 'day_taken', dates: [] }, 'en')).toBe(
      'A day just went to another driver.',
    );
  });
});

describe('the driver pick on a change card', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));
  const shortlisted = {
    name: 'Made',
    terms: { price_minor: 70_000_000, currency: 'IDR', price_unit: 'day', included_hours: 10 },
  } as const;
  const providers = new Map([[MADE, shortlisted]]);

  it('reads the driver, his days in order and the terms he was shortlisted on', () => {
    const pick = driverPickOf(crewPickOp(MADE, days, all)!, providers);
    expect(pick?.name).toBe('Made');
    expect(pick?.days.map((day) => day.date)).toEqual(['2026-10-14', '2026-10-15']);
    expect(pick?.terms).toEqual(shortlisted.terms);
    expect(driverPickDetail(pick!, 'en')).toBe(
      `Wed 14, Thu 15 · ${pickTermsLine(shortlisted.terms, 'en')}`,
    );
  });

  it('shows the quote over the shortlisted terms when one is voted on', () => {
    const pick = driverPickOf(crewPickOp(MADE, days, all, quote)!, providers);
    expect(pick?.terms?.price_minor).toBe(80_000_000);
  });

  it('is not read from a plan item change, and survives a driver not yet synced', () => {
    expect(
      driverPickOf(
        {
          op: 'remove',
          target: MADE,
          reason: 'manual',
          affected_user_ids: [],
          booking_impact: false,
        },
        providers,
      ),
    ).toBeNull();
    const unknown = driverPickOf(crewPickOp(MADE, days, all)!, new Map());
    expect(unknown).toMatchObject({ name: '', terms: null });
    expect(driverPickTitle({ pick: unknown!, author: 'Minh', mine: false })).toBe(
      'Minh wants a driver to drive',
    );
    expect(pickTermsLine(null, 'en')).toBe('Price not said');
  });

  it('says who wants him, and words the price by its unit', () => {
    const pick = driverPickOf(crewPickOp(MADE, days, all)!, providers)!;
    expect(driverPickTitle({ pick, author: 'Minh', mine: false })).toBe('Minh wants Made to drive');
    expect(driverPickTitle({ pick, author: 'Minh', mine: true })).toBe('You want Made to drive');
    const price = pickTermsLine(
      { ...shortlisted.terms, price_unit: null, included_hours: null },
      'en',
    );
    expect(pickTermsLine(shortlisted.terms, 'en')).toBe(`${price} a day · covers 10 hours`);
    expect(pickTermsLine({ ...shortlisted.terms, price_unit: 'hours' }, 'en')).toBe(
      `${price} for 10 hours`,
    );
    expect(pickTermsLine({ ...shortlisted.terms, price_minor: null }, 'en')).toBe('Price not said');
  });

  it('counts a long run of days instead of listing them', () => {
    const run = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'].map((date) => ({
      date,
      window_start: null,
      window_end: null,
      pickup: null,
    }));
    expect(pickDaysLine(run, 'en')).toBe('4 days from Wed 14');
  });
});
