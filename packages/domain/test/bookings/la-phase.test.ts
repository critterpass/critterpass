import { describe, expect, it } from 'vitest';

import { laPhase, type LaSegment } from '../../src/flights/la-phase';

const DEP = new Date('2026-10-12T01:05:00Z');
const leg = (patch: Partial<LaSegment> = {}): LaSegment => ({
  status: 'on_time',
  schedDepAt: DEP,
  estDepAt: null,
  actDepAt: null,
  actArrAt: null,
  estArrAt: null,
  schedArrAt: new Date('2026-10-12T03:40:00Z'),
  boardingAt: new Date('2026-10-12T00:25:00Z'),
  ...patch,
});
const at = (iso: string) => new Date(iso);

describe('flight Live Activity phase', () => {
  it('opens three hours before departure, following a delay', () => {
    expect(laPhase(leg(), at('2026-10-11T22:04:00Z'))).toBeNull();
    expect(laPhase(leg(), at('2026-10-11T22:05:00Z'))).toBe('check_in');
    const late = leg({ estDepAt: new Date('2026-10-12T02:05:00Z') });
    expect(laPhase(late, at('2026-10-11T22:30:00Z'))).toBeNull();
  });

  it('moves through boarding, departed, landed and pickup, then closes', () => {
    expect(laPhase(leg(), at('2026-10-12T00:25:00Z'))).toBe('boarding');
    expect(laPhase(leg({ status: 'boarding' }), at('2026-10-11T23:00:00Z'))).toBe('boarding');
    expect(laPhase(leg({ status: 'departed' }), at('2026-10-12T01:10:00Z'))).toBe('departed');
    const landed = leg({ status: 'landed', actArrAt: new Date('2026-10-12T03:32:00Z') });
    expect(laPhase(landed, at('2026-10-12T03:50:00Z'))).toBe('landed');
    expect(laPhase(landed, at('2026-10-12T04:30:00Z'))).toBe('pickup');
    expect(laPhase(landed, at('2026-10-12T05:33:00Z'))).toBeNull();
  });

  it('has no activity for a cancelled flight', () => {
    expect(laPhase(leg({ status: 'cancelled' }), at('2026-10-12T00:00:00Z'))).toBeNull();
  });
});
