import { linkPreviewSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { countdownLabel, estimateEach, guideKind, memberStubs, tripDates } from './invite-facts';

const preview = linkPreviewSchema.parse({
  kind: 'invite',
  crew_name: 'The Bali Six',
  inviter_first_name: 'Winston',
  trip_place: 'Bali',
  members_count: 3,
  expires_at: '2026-10-01T12:00:00.000Z',
  state: 'active',
  trip_start: '2026-10-12',
  trip_end: '2026-10-19',
  members: [
    { first_name: 'maya', colour: 'pink' },
    { first_name: 'Arjun', colour: 'blue/dashed' },
    { first_name: 'Jess', colour: null },
  ],
  estimate_minor: 124000,
  estimate_currency: 'USD',
  guide_slug: 'pon',
});

describe('invite facts', () => {
  it('maps the guide to its sticker, Tokek by default', () => {
    expect(guideKind('pon')).toBe('tanuki');
    expect(guideKind(null)).toBe('gecko');
    expect(guideKind('someone-new')).toBe('gecko');
  });

  it('turns members into initials with their colour and ring', () => {
    expect(memberStubs(preview)).toEqual([
      { initial: 'M', name: 'maya', colour: 'var(--color-pink)', ring: 'solid' },
      { initial: 'A', name: 'Arjun', colour: 'var(--color-blue)', ring: 'dashed' },
      { initial: 'J', name: 'Jess', colour: 'var(--color-paper-warm)', ring: 'solid' },
    ]);
    expect(memberStubs(null)).toEqual([]);
  });

  it('formats dates and the per-person estimate', () => {
    expect(tripDates(preview)).toMatch(/^Oct 12\s*–\s*19$/u);
    expect(estimateEach(preview)).toBe('$1,240');
    expect(estimateEach({ ...preview, estimate_minor: 150000, estimate_currency: 'JPY' })).toBe(
      '¥150,000',
    );
    expect(tripDates({ ...preview, trip_end: null })).toBeNull();
  });

  it('counts down to the expiry and stops at zero', () => {
    const now = Date.parse('2026-09-27T12:47:56.000Z');
    expect(countdownLabel('2026-10-01T12:00:00.000Z', now)).toBe('3d 23:12:04');
    expect(countdownLabel('2026-09-27T13:00:00.000Z', now)).toBe('00:12:04');
    expect(countdownLabel('2026-09-27T12:00:00.000Z', now)).toBeNull();
    expect(countdownLabel(null, now)).toBeNull();
  });
});
