import { describe, expect, it } from 'vitest';

import { coTravellers } from '../../src/flights/co-travellers';
import { diffFlight, type FlightReading } from '../../src/flights/status-diff';

const reading = (over: Partial<FlightReading>): FlightReading => ({
  status: 'scheduled',
  gate: null,
  terminal: null,
  delayMin: null,
  estDepAt: null,
  estArrAt: null,
  actDepAt: null,
  actArrAt: null,
  ...over,
});

describe('flight status diff', () => {
  it('reports each change once through a delay, a gate, departure and landing', () => {
    let stored = {
      status: 'scheduled' as const,
      gate: null as string | null,
      delayMin: null as number | null,
    };
    const seen: string[] = [];
    for (const next of [
      reading({ status: 'delayed', delayMin: 45 }),
      reading({ status: 'delayed', delayMin: 45 }),
      reading({ status: 'delayed', delayMin: 48, gate: 'B4' }),
      reading({ status: 'departed', delayMin: 48, gate: 'B4' }),
      reading({ status: 'scheduled', delayMin: 48, gate: 'B4' }),
      reading({ status: 'landed', delayMin: 48, gate: 'B4' }),
    ]) {
      const diff = diffFlight(stored, next);
      seen.push(...diff.changes);
      stored = { status: diff.status as never, gate: next.gate, delayMin: next.delayMin };
    }
    expect(seen).toEqual(['delay', 'gate', 'departed', 'landed']);
  });

  it('reports a delay again only when it moves by ten minutes', () => {
    expect(
      diffFlight({ status: 'delayed', gate: null, delayMin: 45 }, reading({ delayMin: 52 }))
        .changes,
    ).toEqual([]);
    expect(
      diffFlight({ status: 'delayed', gate: null, delayMin: 45 }, reading({ delayMin: 60 }))
        .changes,
    ).toEqual(['delay']);
    expect(
      diffFlight({ status: 'scheduled', gate: null, delayMin: null }, reading({ delayMin: 10 }))
        .changes,
    ).toEqual([]);
  });
});

describe('co-travellers', () => {
  it('names crewmates on the same carrier, number and scheduled departure only', () => {
    const mine = {
      ownerId: 'me',
      carrier: 'SQ',
      flightNo: '938',
      schedDepAt: '2026-10-12T01:40:00Z',
    };
    expect(
      coTravellers(mine, [
        mine,
        { ...mine, ownerId: 'maya', schedDepAt: '2026-10-12T09:40:00+08:00' },
        { ...mine, ownerId: 'alex' },
        { ...mine, ownerId: 'sam', flightNo: '940' },
        { ...mine, ownerId: 'kai', schedDepAt: '2026-10-13T01:40:00Z' },
      ]),
    ).toEqual(['maya', 'alex']);
  });
});
