/**
 * GO's handoff and preview: the maps-app link per platform, app and mode (only the place goes in
 * it), which app Start opens, the preview's states (routed, straight-line fallback, no location,
 * no signal), the Grab row, the route params, and the leave-by push opening GO for its stop.
 */
import { describe, expect, it } from '@jest/globals';

import type { RideQuoteResult } from '@cp/domain';

import { leaveByGoRoute, routeForTap, type PushTap } from '@/data/push/routing';

import { paramsForTarget, targetFromParams, type GoTarget } from '../data/go-place';
import { defaultMapsApp, mapsAppFor, mapsDirectionsUrl } from '../maps-handoff';
import { firstMode, grabRow, previewState, type PreviewInput } from '../preview-model';

const MARBLE = { lat: 16.0039, lng: 108.2633 };
const HERE = { lat: 16.0611, lng: 108.2272 };
const TRIP = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02';

describe('the maps app handoff', () => {
  it('builds Apple Maps directions on foot and by car', () => {
    expect(mapsDirectionsUrl(MARBLE, 'walk', 'apple')).toBe(
      'https://maps.apple.com/?daddr=16.003900,108.263300&dirflg=w',
    );
    expect(mapsDirectionsUrl(MARBLE, 'drive', 'apple')).toBe(
      'https://maps.apple.com/?daddr=16.003900,108.263300&dirflg=d',
    );
  });

  it('builds Google Maps directions on foot and by car', () => {
    expect(mapsDirectionsUrl(MARBLE, 'walk', 'google')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=16.003900,108.263300&travelmode=walking',
    );
    expect(mapsDirectionsUrl(MARBLE, 'drive', 'google')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=16.003900,108.263300&travelmode=driving',
    );
  });

  it('opens the chosen app on iPhone, Apple Maps until one is chosen, and Google Maps on Android', () => {
    expect(defaultMapsApp('ios')).toBe('apple');
    expect(defaultMapsApp('android')).toBe('google');
    expect(mapsAppFor('ios', null)).toBe('apple');
    expect(mapsAppFor('ios', 'google')).toBe('google');
    expect(mapsAppFor('android', 'apple')).toBe('google');
  });
});

/** The polyline format's own worked example. */
const SHAPE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

const ROUTED = {
  walk: { minutes: 104, meters: 8120, shape: SHAPE, approx: false, source: 'valhalla' },
  drive: { minutes: 21, meters: 8476, shape: SHAPE, approx: false, source: 'valhalla' },
} as const;

const base: PreviewInput = {
  place: MARBLE,
  locate: { kind: 'here', at: HERE },
  route: { kind: 'ready', preview: ROUTED },
  online: true,
  mode: 'drive',
  ride: { kind: 'none' },
};

describe('the preview', () => {
  it('draws the road line for the selected mode with routed minutes', () => {
    const state = previewState(base);
    expect(state.status).toBe('routed');
    expect(state.lineStraight).toBe(false);
    expect(state.line).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    expect(state.minutes).toEqual({
      walk: { minutes: 104, approx: false },
      drive: { minutes: 21, approx: false },
    });
  });

  it('says "about" and draws a dashed straight line when the router fell back', () => {
    const fallback = previewState({
      ...base,
      route: {
        kind: 'ready',
        preview: { ...ROUTED, drive: { ...ROUTED.drive, shape: null, approx: true } },
      },
    });
    expect(fallback.status).toBe('straight');
    expect(fallback.minutes?.drive).toEqual({ minutes: 21, approx: true });
    expect(fallback.line?.[0]).toEqual([HERE.lng, HERE.lat]);
    expect(fallback.line?.at(-1)?.[0]).toBeCloseTo(MARBLE.lng, 9);
    expect(fallback.line?.at(-1)?.[1]).toBeCloseTo(MARBLE.lat, 9);
    expect(fallback.lineStraight).toBe(true);

    const failed = previewState({ ...base, route: { kind: 'error' } });
    expect(failed.status).toBe('straight');
    expect(failed.minutes?.walk.approx).toBe(true);
    expect(failed.minutes?.drive.minutes).toBeGreaterThan(0);
  });

  it('opens on the place without a line when there is no location', () => {
    for (const locate of [{ kind: 'denied' }, { kind: 'no_fix' }] as const) {
      const state = previewState({ ...base, locate });
      expect(state).toMatchObject({ status: 'no_location', you: null, line: null, minutes: null });
    }
  });

  it('drops the line and the minutes with no signal, keeping the position', () => {
    expect(previewState({ ...base, online: false })).toMatchObject({
      status: 'offline',
      you: HERE,
      line: null,
      minutes: null,
    });
    expect(previewState({ ...base, route: { kind: 'offline' } }).status).toBe('offline');
  });

  it('waits for a position, then for the route', () => {
    expect(previewState({ ...base, locate: { kind: 'locating' } }).status).toBe('locating');
    expect(previewState({ ...base, route: { kind: 'loading' } }).status).toBe('routing');
  });

  it('starts on foot when the walk is short', () => {
    expect(firstMode(ROUTED, null)).toBe('drive');
    expect(firstMode({ ...ROUTED, walk: { ...ROUTED.walk, meters: 900 } }, null)).toBe('walk');
    expect(firstMode(null, 1500)).toBe('walk');
    expect(firstMode(null, null)).toBe('walk');
  });
});

describe('the Grab row', () => {
  const quote = (overrides: Partial<RideQuoteResult>): RideQuoteResult => ({
    copy_key: 'suppliers.rides.open_app',
    estimate: null,
    fare_estimate: null,
    links: [],
    phrase_card: { poi_id: 'p', name: 'Marble Mountains', name_local: null, address: null },
    ...overrides,
  });

  it("shows Grab's own fare and opens its deep link", () => {
    const row = grabRow({
      kind: 'ready',
      quote: quote({
        estimate: {
          quote_id: 'q',
          provider: 'grab',
          service: 'GrabCar',
          eta_min: 4,
          fare_low_minor: 95000,
          fare_high_minor: 120000,
          currency: 'VND',
          surge: 'none',
          fetched_at: '2026-10-04T02:30:00Z',
          deep_link: 'grab://open?dropoff=1',
        },
      }),
    });
    expect(row).toEqual({
      kind: 'fare',
      lowMinor: 95000,
      highMinor: 120000,
      currency: 'VND',
      etaMin: 4,
      url: 'grab://open?dropoff=1',
    });
  });

  it('offers Grab without a fare where it runs but gave none, and nothing where it does not run', () => {
    const grab = {
      provider: 'grab',
      app_url: 'grab://x',
      fallback_url: 'https://grab.com',
    } as const;
    expect(grabRow({ kind: 'ready', quote: quote({ links: [grab] }) })).toEqual({
      kind: 'link',
      url: 'grab://x',
      fallbackUrl: 'https://grab.com',
    });
    const gojek = { provider: 'gojek', app_url: 'gojek://x', fallback_url: 'https://gojek.com' };
    expect(grabRow({ kind: 'ready', quote: quote({ links: [gojek as never] }) })).toBeNull();
    expect(grabRow({ kind: 'none' })).toBeNull();
  });
});

describe('the GO route', () => {
  it('round-trips every target through its params', () => {
    const targets: GoTarget[] = [
      { kind: 'place', poiId: 'poi-1', tripId: null },
      { kind: 'place', poiId: 'poi-1', tripId: TRIP },
      { kind: 'leave_by', leaveById: 'lb-1' },
      { kind: 'next_leave_by', tripId: TRIP },
    ];
    for (const target of targets) expect(targetFromParams(paramsForTarget(target))).toEqual(target);
    expect(targetFromParams({})).toBeNull();
    expect(targetFromParams({ leaveBy: 'next' })).toBeNull();
  });

  it("opens GO for the trip's next leave-by from the leave-by push", async () => {
    const tap: PushTap = {
      nid: 'n-1',
      deeplink: `/hub/${TRIP}/day/2026-10-05`,
      type: 'leave_by_alarm',
      crewId: null,
    };
    const href = await routeForTap(tap, () => Promise.reject(new Error('not used')));
    expect(href).toBe(`/go?trip=${TRIP}&leaveBy=next`);
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(targetFromParams(params)).toEqual({ kind: 'next_leave_by', tripId: TRIP });
    expect(leaveByGoRoute({ ...tap, type: 'crew_knock' })).toBeNull();
    expect(leaveByGoRoute({ ...tap, deeplink: '/inbox' })).toBeNull();
  });
});
