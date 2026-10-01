import { describe, expect, it } from '@jest/globals';

import { addressLines, copyFitsBeside } from '../add/address-lines';
import {
  addPayload,
  fxSnapshotFor,
  ignorePayload,
  toCandidateView,
  travellersFor,
} from '../candidates/candidate-model';
import { LAB_CANDIDATES, LAB_MEMBERS, LAB_UID, labCandidate } from '../dev/lab-fixtures';
import { parseMailboxReturn } from '../mailbox/oauth';
import { mailboxStatus } from '../mailbox/use-mailbox';
import { pasteBody } from '../paste/paste-kind';

const TRIP = LAB_MEMBERS.map((member) => member.userId);
const [boatRow, transferRow] = LAB_CANDIDATES;

describe('found bookings', () => {
  it('shows whose email it came from and splits six ways when six travellers are printed', () => {
    const boat = toCandidateView(boatRow!, LAB_MEMBERS, TRIP, LAB_UID);
    expect(boat).toMatchObject({
      state: 'pending',
      fromMember: 'Alex',
      mine: false,
      canSplit: true,
    });
    expect(boat?.travellerIds).toHaveLength(6);
    const transfer = toCandidateView(transferRow!, LAB_MEMBERS, TRIP, LAB_UID);
    expect(transfer).toMatchObject({ fromMember: null, mine: true, canSplit: false });
    expect(transfer?.travellerIds).toEqual([LAB_UID]);
  });

  it('matches printed names to the crew, else takes the trip travellers, else the member', () => {
    const base = JSON.parse(boatRow!.extracted!) as Parameters<typeof travellersFor>[0];
    const named = { ...base!, travellers: ['MAYA LIM', 'alex'] };
    expect(travellersFor(named, LAB_MEMBERS, TRIP, LAB_UID)).toEqual(['u-maya', 'u-alex']);
    const strangers = { ...base!, travellers: ['Pat', 'Sam'] };
    expect(travellersFor(strangers, LAB_MEMBERS, TRIP, LAB_UID)).toEqual(TRIP);
    expect(travellersFor(null, LAB_MEMBERS, TRIP, LAB_UID)).toEqual([LAB_UID]);
  });

  it('skips rows that are resolved and keeps unreadable ones as couldn’t-read cards', () => {
    expect(
      toCandidateView(labCandidate('x', { status: 'accepted' }), LAB_MEMBERS, TRIP, LAB_UID),
    ).toBeNull();
    expect(
      toCandidateView(
        labCandidate('y', { status: 'failed', extracted: '{"bad":1}' }),
        LAB_MEMBERS,
        TRIP,
        LAB_UID,
      ),
    ).toMatchObject({ state: 'failed', booking: null, canSplit: false });
  });

  it('ADD sends the travellers and the split, with the FX snapshot for a foreign price', () => {
    const boat = toCandidateView(boatRow!, LAB_MEMBERS, TRIP, LAB_UID)!;
    const usd = addPayload(boat, {
      tripId: 't',
      split: true,
      crewCurrency: 'USD',
      fx: [],
      newId: () => 'e1',
    });
    expect(usd).toEqual({
      candidate_id: 'c-boat',
      action: 'add',
      trip_id: 't',
      traveller_ids: TRIP,
      split: { expense_id: 'e1', shares: TRIP.map((user_id) => ({ user_id })) },
    });
    const fx = [
      { id: 'fx-idr', base: 'USD', quote: 'IDR' },
      { id: 'fx-sgd', base: 'USD', quote: 'SGD' },
    ];
    expect(fxSnapshotFor(fx, 'SGD', 'IDR')).toBe('fx-sgd');
    expect(
      addPayload(boat, { tripId: 't', split: true, crewCurrency: 'SGD', fx, newId: () => 'e2' })
        .split,
    ).toEqual({
      expense_id: 'e2',
      fx_snapshot_id: 'fx-idr',
      shares: TRIP.map((user_id) => ({ user_id })),
    });
    expect(
      addPayload(boat, { tripId: 't', split: true, crewCurrency: 'SGD', fx: [] }).split,
    ).toBeUndefined();
    expect(
      addPayload(boat, { tripId: 't', split: false, crewCurrency: 'USD', fx: [] }).split,
    ).toBeUndefined();
    expect(ignorePayload(boat)).toEqual({ candidate_id: 'c-boat', action: 'ignore' });
  });
});

describe('paste', () => {
  it('sends one link as a link and anything else as text', () => {
    expect(pasteBody('  https://www.agoda.com/booking/123  ')).toEqual({
      url: 'https://www.agoda.com/booking/123',
    });
    expect(pasteBody('K7PQ2Z')).toEqual({ text: 'K7PQ2Z' });
    expect(pasteBody('See https://klook.com/x for details')).toEqual({
      text: 'See https://klook.com/x for details',
    });
    expect(pasteBody('ftp://example.com/x')).toEqual({ text: 'ftp://example.com/x' });
    expect(pasteBody('   ')).toBeNull();
  });
});

describe('mailbox', () => {
  const connection = {
    connection_id: 'm',
    provider: 'gmail' as const,
    status: 'active',
    last_scan_at: null,
  };

  it('is coming soon while no provider is on, then Pass+ locked, then offers the providers on', () => {
    const off = { gmail: false, microsoft: false, passPlus: true, connections: null };
    expect(mailboxStatus(off)).toEqual({ kind: 'soon' });
    expect(mailboxStatus({ ...off, gmail: true, passPlus: false })).toEqual({ kind: 'locked' });
    expect(mailboxStatus({ ...off, gmail: true })).toEqual({
      kind: 'choose',
      providers: ['gmail'],
    });
    expect(mailboxStatus({ ...off, gmail: true, connections: [connection] })).toEqual({
      kind: 'connected',
      connection,
    });
    expect(
      mailboxStatus({ ...off, gmail: true, connections: [{ ...connection, status: 'revoked' }] }),
    ).toEqual({ kind: 'choose', providers: ['gmail'] });
  });

  it('reads the sign-in return', () => {
    expect(
      parseMailboxReturn({ provider: 'gmail', status: 'authorized', state: 's', code: 'c' }),
    ).toEqual({
      kind: 'authorized',
      provider: 'gmail',
      state: 's',
      code: 'c',
    });
    expect(parseMailboxReturn({ provider: 'microsoft', status: 'denied' })).toEqual({
      kind: 'denied',
      provider: 'microsoft',
    });
    expect(parseMailboxReturn({ provider: 'yahoo', status: 'authorized' })).toEqual({
      kind: 'failed',
      provider: null,
    });
  });
});

describe('the forward address', () => {
  it('breaks only at the @, and puts COPY under an address too long to sit beside it', () => {
    expect(addressLines('bali-six@in.critterpass.app')).toEqual([
      'bali-six',
      '@in.critterpass.app',
    ]);
    expect(addressLines('no-domain')).toEqual(['no-domain', '']);
    // An iPhone-width pill is about 324 points inside its padding.
    expect(copyFitsBeside('bali-six@in.critterpass.app', 324)).toBe(true);
    const staging = 'bali-demo-crew-a7635@in.staging.critterpass.app';
    expect(copyFitsBeside(staging, 324)).toBe(true);
    expect(copyFitsBeside(staging, 300)).toBe(false);
    expect(copyFitsBeside('the-head-still-didnt-look-so-goo-5ee57@in.critterpass.app', 324)).toBe(
      false,
    );
  });
});
