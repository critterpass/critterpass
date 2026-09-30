import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  PAYWALL_ENTRIES,
  PAYWALL_ENTRY_POINTS,
  PAYWALL_SUPPRESS_CONTEXTS,
  type PaywallEntryPoint,
} from './entries';
import { canShowPaywall, type PaywallImpressionLike, type PaywallRequest } from './governor';

const governed = PAYWALL_ENTRY_POINTS.filter((entry) => PAYWALL_ENTRIES[entry].governed);
const explicit = PAYWALL_ENTRY_POINTS.filter(
  (entry) =>
    !PAYWALL_ENTRIES[entry].governed && PAYWALL_ENTRIES[entry].suppressContexts.length === 0,
);
const trips = ['trip-a', 'trip-b', null] as const;
const days = ['2026-10-01', '2026-10-02', '2026-10-03'] as const;

const request = (over: Partial<PaywallRequest> & { entry: PaywallEntryPoint }): PaywallRequest => ({
  tripId: null,
  localDate: '2026-10-01',
  now: new Date('2026-10-01T10:00:00Z'),
  contexts: [],
  lastErrorAt: null,
  impressions: [],
  ...over,
});

const attempt = fc.record({
  entry: fc.constantFrom(...PAYWALL_ENTRY_POINTS),
  tripId: fc.constantFrom(...trips),
  localDate: fc.constantFrom(...days),
  quietNo: fc.boolean(),
});

describe('paywall governor', { timeout: 60_000 }, () => {
  it('shows at most one unsolicited paywall per local day, whatever asks', () => {
    fc.assert(
      fc.property(fc.array(attempt, { maxLength: 40 }), (attempts) => {
        const seen: PaywallImpressionLike[] = [];
        for (const a of [...attempts].sort((x, y) => x.localDate.localeCompare(y.localDate))) {
          const decision = canShowPaywall(request({ ...a, impressions: seen }));
          if (!decision.show) continue;
          seen.push({
            entryPoint: a.entry,
            tripId: a.tripId,
            outcome: 'shown',
            governed: decision.governed,
            localDate: a.localDate,
          });
          if (a.quietNo) {
            seen.push({
              entryPoint: a.entry,
              tripId: a.tripId,
              outcome: 'quiet_no',
              governed: decision.governed,
              localDate: a.localDate,
            });
          }
        }
        for (const day of days) {
          const unsolicited = seen.filter(
            (s) => s.governed && s.outcome === 'shown' && s.localDate === day,
          );
          expect(unsolicited.length).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('never shows a governed paywall on day-of, Help, SOS or disruption screens', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...governed),
        fc.subarray([...PAYWALL_SUPPRESS_CONTEXTS], { minLength: 1 }),
        (entry, contexts) => {
          expect(canShowPaywall(request({ entry, contexts })).show).toBe(false);
        },
      ),
    );
    // The live map teaser steps aside for Help and SOS, where the map is free.
    expect(canShowPaywall(request({ entry: 'live_map', contexts: ['sos'] })).show).toBe(false);
  });

  it('hides an offer for the trip it got a quiet no on, and only that trip', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PAYWALL_ENTRY_POINTS.filter((e) => PAYWALL_ENTRIES[e].quietNoPerTrip)),
        (entry) => {
          const impressions: PaywallImpressionLike[] = [
            {
              entryPoint: entry,
              tripId: 'trip-a',
              outcome: 'quiet_no',
              governed: false,
              localDate: '2026-09-01',
            },
          ];
          expect(canShowPaywall(request({ entry, tripId: 'trip-a', impressions }))).toEqual({
            show: false,
            reason: 'quiet_no',
          });
          expect(canShowPaywall(request({ entry, tripId: 'trip-b', impressions })).show).toBe(true);
        },
      ),
    );
  });

  it('never holds back explicit navigation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...explicit),
        fc.array(fc.constantFrom(...governed), { maxLength: 5 }),
        (entry, earlier) => {
          const impressions = earlier.map((e) => ({
            entryPoint: e,
            tripId: null,
            outcome: 'shown' as const,
            governed: true,
            localDate: '2026-10-01',
          }));
          const decision = canShowPaywall(
            request({ entry, impressions, lastErrorAt: new Date('2026-10-01T09:59:00Z') }),
          );
          expect(decision).toEqual({ show: true, governed: false });
        },
      ),
    );
  });

  it('waits ten minutes after an error', () => {
    const lastErrorAt = new Date('2026-10-01T09:55:00Z');
    expect(canShowPaywall(request({ entry: 'guide_limit', lastErrorAt }))).toEqual({
      show: false,
      reason: 'recent_error',
    });
    expect(
      canShowPaywall(
        request({ entry: 'guide_limit', lastErrorAt, now: new Date('2026-10-01T10:06:00Z') }),
      ).show,
    ).toBe(true);
  });
});
