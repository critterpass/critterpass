import { describe, expect, it } from 'vitest';

import { DomainError } from '../../errors';
import { classifyPersonalClaim, previewShowsInviteeName } from '../forwarding';
import {
  assertInviteClaimable,
  effectiveInviteStatus,
  inviteStateMachine,
  isTerminalInvite,
  transitionInvite,
  type InviteStatus,
} from '../machine';

const now = new Date('2026-10-01T00:00:00Z');
const later = new Date('2026-10-05T00:00:00Z');
const earlier = new Date('2026-09-20T00:00:00Z');

describe('invite machine', () => {
  const legal: ReadonlyArray<[InviteStatus, InviteStatus]> = [
    ['pending', 'later'],
    ['later', 'pending'],
    ['pending', 'claimed'],
    ['later', 'claimed'],
    ['pending', 'waitlisted'],
    ['waitlisted', 'claimed'],
    ['pending', 'declined'],
    ['later', 'declined'],
    ['pending', 'expired'],
    ['waitlisted', 'expired'],
    ['pending', 'revoked'],
    ['waitlisted', 'revoked'],
  ];
  it.each(legal)('allows %s → %s', (from, to) => {
    expect(transitionInvite(from, to)).toBe(to);
  });

  const illegal: ReadonlyArray<[InviteStatus, InviteStatus]> = [
    ['claimed', 'pending'],
    ['declined', 'claimed'],
    ['expired', 'claimed'],
    ['revoked', 'pending'],
    ['waitlisted', 'later'],
    ['claimed', 'revoked'],
  ];
  it.each(illegal)('refuses %s → %s', (from, to) => {
    expect(() => transitionInvite(from, to)).toThrow(DomainError);
  });

  it('starts every invite pending and ends in the four terminal states', () => {
    expect(inviteStateMachine.initialStates()).toEqual(['pending']);
    expect((['declined', 'claimed', 'expired', 'revoked'] as const).every(isTerminalInvite)).toBe(
      true,
    );
    expect(isTerminalInvite('waitlisted')).toBe(false);
  });

  it('reads an open invite past its expiry as expired before the sweep runs', () => {
    expect(effectiveInviteStatus('pending', earlier, now)).toBe('expired');
    expect(effectiveInviteStatus('waitlisted', earlier, now)).toBe('expired');
    expect(effectiveInviteStatus('claimed', earlier, now)).toBe('claimed');
    expect(effectiveInviteStatus('pending', later, now)).toBe('pending');
  });

  it('answers a claim of an expired or revoked invite with its own code', () => {
    expect(() => assertInviteClaimable('pending', earlier, now)).toThrow(
      expect.objectContaining({ code: 'INVITE_EXPIRED' }),
    );
    expect(() => assertInviteClaimable('revoked', later, now)).toThrow(
      expect.objectContaining({ code: 'INVITE_REVOKED' }),
    );
    expect(() => assertInviteClaimable('pending', later, now)).not.toThrow();
  });
});

describe('forwarded personal links', () => {
  const seat = { open: true, claimedBy: null, phoneHash: null };
  const opener = { uid: 'u-dev', phoneHash: null };

  it('gives the named seat to the first opener of an open link', () => {
    expect(classifyPersonalClaim(seat, opener)).toBe('personal');
  });

  it('treats a second opener after the claim as forwarded', () => {
    expect(
      classifyPersonalClaim({ ...seat, claimedBy: 'u-dev' }, { uid: 'u-sam', phoneHash: null }),
    ).toBe('forwarded');
  });

  it('keeps a repeat claim by the invitee personal', () => {
    expect(classifyPersonalClaim({ ...seat, open: false, claimedBy: 'u-dev' }, opener)).toBe(
      'personal',
    );
  });

  it('treats an opener whose verified phone differs from the picked contact as forwarded', () => {
    expect(
      classifyPersonalClaim({ ...seat, phoneHash: 'aa' }, { uid: 'u-sam', phoneHash: 'bb' }),
    ).toBe('forwarded');
    expect(
      classifyPersonalClaim({ ...seat, phoneHash: 'aa' }, { uid: 'u-dev', phoneHash: 'aa' }),
    ).toBe('personal');
    expect(classifyPersonalClaim({ ...seat, phoneHash: 'aa' }, opener)).toBe('personal');
  });

  it('names the invitee in a preview only while the named seat is open', () => {
    expect(previewShowsInviteeName(seat)).toBe(true);
    expect(previewShowsInviteeName({ open: true, claimedBy: 'u-dev' })).toBe(false);
    expect(previewShowsInviteeName({ open: false, claimedBy: null })).toBe(false);
  });
});
