import { describe, expect, it } from '@jest/globals';
import { MOCK_FLAG_ACCESSORY, recordVisitPayloadSchema, type RecordVisitPayload } from '@cp/domain';
import { act, renderHook } from '@testing-library/react-native';

import type { DayPlan, VisitCandidate } from '../../bridge-inputs';
import { createLocationEngine } from '../../engine';
import type { EngineFix, EngineRegionEvent, LocationSessionPort } from '../../ports';
import { visitConsentGranted, visitConsentPayload } from '../consent';
import { createVisitDetector, type DetectedVisit } from '../detector';
import { createVisitQueue } from '../queue';
import { getCurrentVisit } from '../use-current-visit';
import { recordVisit, useVisitBridge } from '../use-visit-bridge';

const MIN = 60_000;
const TRIP = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';
const WARUNG: VisitCandidate = {
  id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e61',
  lat: -8.5069,
  lng: 115.2625,
  radiusM: 60,
  category: 'food',
};
const TEMPLE: VisitCandidate = {
  id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e62',
  lat: -8.52,
  lng: 115.27,
  radiusM: null,
  category: 'temple_shrine',
};

/** A walk: approach, dwell at the warung for `dwellMin`, then walk off (one fix a minute). */
function walk(start: number, dwellMin: number, accuracy = 10, mock = 0): EngineFix[] {
  const at = (minute: number) => start + minute * MIN;
  const away = { lat: WARUNG.lat + 0.004, lng: WARUNG.lng };
  const fixes: EngineFix[] = [
    { ...away, acc: accuracy, at: at(0), stationary: false, mock },
    { lat: WARUNG.lat + 0.001, lng: WARUNG.lng, acc: accuracy, at: at(1), stationary: false, mock },
  ];
  for (let minute = 2; minute <= 2 + dwellMin; minute += 1) {
    fixes.push({
      lat: WARUNG.lat,
      lng: WARUNG.lng,
      acc: accuracy,
      at: at(minute),
      stationary: true,
      mock,
    });
  }
  for (let minute = 3 + dwellMin; minute <= 7 + dwellMin; minute += 1) {
    fixes.push({ ...away, acc: accuracy, at: at(minute), stationary: false, mock });
  }
  return fixes;
}

function detect(fixes: readonly EngineFix[], candidates: readonly VisitCandidate[] = [WARUNG]) {
  const arrived: DetectedVisit[] = [];
  const left: DetectedVisit[] = [];
  const detector = createVisitDetector({
    onArrived: (v) => arrived.push(v),
    onLeft: (v) => left.push(v),
  });
  detector.setCandidates(candidates);
  for (const fix of fixes) detector.onFix(fix);
  return { arrived, left, detector };
}

describe('visit detector', () => {
  it('turns a dwell at a planned warung into one arrival and one departure with aggregate evidence', () => {
    const { arrived, left } = detect(walk(0, 12, 12, MOCK_FLAG_ACCESSORY));
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({
      poiId: WARUNG.id,
      category: 'food',
      arrivedAt: 2 * MIN,
      leftAt: null,
    });
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ arrivedAt: 2 * MIN, acc: 12, mockFlags: MOCK_FLAG_ACCESSORY });
    expect(left[0]!.dwellS).toBeGreaterThanOrEqual(12 * 60);
  });

  it('needs the category dwell (a warung wants 10 minutes) and good accuracy', () => {
    expect(detect(walk(0, 5)).arrived).toEqual([]);
    expect(detect(walk(0, 15, 80)).arrived).toEqual([]);
  });

  it('honours a server dwell override and keeps state when the plan is re-sent', () => {
    const arrived: DetectedVisit[] = [];
    const detector = createVisitDetector({
      onArrived: (v) => arrived.push(v),
      onLeft: () => undefined,
      dwellMsFor: (category) => (category === 'food' ? 2 * MIN : undefined),
    });
    detector.setCandidates([WARUNG, TEMPLE]);
    const fixes = walk(0, 4);
    for (const fix of fixes.slice(0, 4)) detector.onFix(fix);
    detector.setCandidates([WARUNG]);
    for (const fix of fixes.slice(4, 6)) detector.onFix(fix);
    expect(arrived).toHaveLength(1);
    expect(detector.current()).toEqual({ poiId: WARUNG.id, category: 'food' });
    detector.reset();
    expect(detector.current()).toBeNull();
  });

  it('finishes a dwell on ticks while a resting phone sends nothing', () => {
    const { arrived, detector } = detect(walk(0, 0).slice(0, 3));
    expect(arrived).toEqual([]);
    detector.tick(13 * MIN);
    expect(arrived).toHaveLength(1);
  });
});

describe('visit queue', () => {
  it('records the arrival, then closes the same visit id on departure', async () => {
    const sent: RecordVisitPayload[] = [];
    const queue = createVisitQueue({
      send: (p) => Promise.resolve(void sent.push(p)),
      tripId: () => TRIP,
    });
    const { arrived, left } = detect(walk(0, 12));
    await queue.arrived(arrived[0]!);
    await queue.left(left[0]!);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.visit_id).toBe(sent[1]!.visit_id);
    expect(sent[0]).not.toHaveProperty('left_at');
    expect(sent[1]!.left_at).toBeDefined();
    for (const payload of sent) {
      expect(() => recordVisitPayloadSchema.parse(payload)).not.toThrow();
      expect(JSON.stringify(payload)).not.toMatch(/lat|lng/);
    }
  });

  it('records expense and manual check-ins without evidence, and nothing without a trip', async () => {
    const sent: RecordVisitPayload[] = [];
    let trip: string | null = TRIP;
    const queue = createVisitQueue({
      send: (p) => Promise.resolve(void sent.push(p)),
      tripId: () => trip,
    });
    expect(await queue.recordVisit({ source: 'expense', poiId: WARUNG.id, at: 5 })).toMatch(/-/);
    expect(sent[0]).toMatchObject({ source: 'expense', arrived_at: new Date(5).toISOString() });
    expect(sent[0]).not.toHaveProperty('evidence');
    trip = null;
    expect(await queue.recordVisit({ source: 'manual', poiId: WARUNG.id })).toBeNull();
    await queue.arrived(detect(walk(0, 12)).arrived[0]!);
    expect(sent).toHaveLength(1);
  });
});

describe('visit consent', () => {
  it('is on only with a granted, unrevoked row', () => {
    expect(visitConsentGranted([])).toBe(false);
    expect(
      visitConsentGranted([{ purpose: 'visit_detection', granted_at: 'x', revoked_at: null }]),
    ).toBe(true);
    expect(
      visitConsentGranted([{ purpose: 'visit_detection', granted_at: 'x', revoked_at: 'y' }]),
    ).toBe(false);
    expect(visitConsentGranted([{ purpose: 'analytics', granted_at: 'x', revoked_at: null }])).toBe(
      false,
    );
    expect(visitConsentPayload(false)).toMatchObject({
      purpose: 'visit_detection',
      granted: false,
    });
  });
});

describe('visit bridge on the engine', () => {
  function engineWithSession() {
    let fixListener: ((fix: EngineFix) => void) | null = null;
    const session: LocationSessionPort = {
      startTripSession: () => Promise.resolve(true),
      stopTripSession: () => Promise.resolve(),
      setAccuracy: () => undefined,
      isSessionRunning: () => true,
      monitorRegions: () => Promise.resolve(0),
      clearRegions: () => Promise.resolve(),
      isLowPowerMode: () => false,
      drainRegionEvents: (): readonly EngineRegionEvent[] => [],
      addFixListener: (listener) => {
        fixListener = listener;
        return { remove: () => (fixListener = null) };
      },
      addRegionListener: () => ({ remove: () => undefined }),
    };
    let clock = Date.parse('2026-10-12T02:00:00Z');
    const engine = createLocationEngine({
      session,
      upload: () => Promise.resolve({ status: 202 }),
      platform: 'ios',
      now: () => clock,
    });
    return {
      engine,
      start: () =>
        engine.update({
          trip: {
            status: 'in_trip',
            startDate: '2026-10-10',
            endDate: '2026-10-14',
            tz: 'Asia/Makassar',
            destinationCountry: 'ID',
          },
          homeCountry: 'VN',
          exploreAtHome: false,
          deviceTz: 'Asia/Makassar',
          level: 'wiu',
          share: null,
          appActive: true,
          geofenceContext: plan.context,
          androidBackgroundGeofences: false,
        }),
      walk: (fixes: readonly EngineFix[]) => {
        for (const fix of fixes) {
          clock = fix.at;
          fixListener?.(fix);
        }
      },
      t0: clock,
    };
  }

  const plan: DayPlan = {
    context: { tripId: TRIP, planPois: [WARUNG], stay: null },
    candidates: [WARUNG],
  };

  it('queues one record_visit per arrival with consent, and none without', async () => {
    for (const consentGranted of [true, false]) {
      const sent: RecordVisitPayload[] = [];
      const rig = engineWithSession();
      await rig.start();
      const hook = await renderHook(() =>
        useVisitBridge({
          engine: rig.engine,
          plan,
          consentGranted,
          send: (payload) => Promise.resolve(void sent.push(payload)),
        }),
      );
      await act(async () => {
        rig.walk(walk(rig.t0, 12).slice(0, 15));
        await Promise.resolve();
      });
      expect(getCurrentVisit()).toEqual(
        consentGranted ? { poiId: WARUNG.id, category: 'food' } : null,
      );
      expect(sent.map((p) => p.source)).toEqual(consentGranted ? ['geofence'] : []);
      await hook.unmount();
      expect(getCurrentVisit()).toBeNull();
      await rig.engine.dispose();
    }
  });

  it('sends manual check-ins through the live session', async () => {
    const sent: RecordVisitPayload[] = [];
    const rig = engineWithSession();
    const hook = await renderHook(() =>
      useVisitBridge({
        engine: rig.engine,
        plan,
        consentGranted: false,
        send: (p) => Promise.resolve(void sent.push(p)),
      }),
    );
    await act(async () => {
      await recordVisit({ source: 'manual', poiId: WARUNG.id });
    });
    expect(sent.map((p) => `${p.source}:${p.trip_id}`)).toEqual([`manual:${TRIP}`]);
    await hook.unmount();
  });
});
