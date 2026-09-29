/**
 * The crew live map's pure data: folding snapshots and publications (a paused or ended share
 * drops the pin at once), bunching and staleness in the view, status lines, glide easing, and
 * trails that live in screen memory only: folding a scooter ride never touches storage.
 */
// Storage spies: every export of the key-value store and the file system, wrapped so the trail
// test can prove nothing is written while a ride is folded.
function mockSpyAll(actual: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === 'function' && /^[a-z]/.test(name)
        ? jest.fn((...args: unknown[]) => (value as (...a: unknown[]) => unknown)(...args))
        : value,
    ]),
  );
}
jest.mock('react-native-mmkv', () => mockSpyAll(jest.requireActual('react-native-mmkv')));
jest.mock('expo-file-system', () => mockSpyAll(jest.requireActual('expo-file-system')));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { renderHook } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system';
import * as Mmkv from 'react-native-mmkv';

import { liveSnapshotSchema, type LiveSnapshot } from '@cp/domain';

import { statusLine } from '../copy';
import { applyLiveMessage, fromSnapshot } from '../data/live-state';
import { foldTrails, useTrails, visibleTrails } from '../data/use-trails';
import type { TripCrew } from '../data/use-trip-crew';
import { buildLiveView } from '../data/view-model';
import { glideAt, glideDuration, MAX_GLIDE_MS } from '../map/use-glide';
import { ALEX, DEV, JORDAN, MAYA, NOW, RIN, TRIP } from '../test-support/ids';
import recorded from '../test-support/snapshot.fixture.json';

i18n.loadAndActivate({ locale: 'en', messages: {} });

const snapshot: LiveSnapshot = liveSnapshotSchema.parse(recorded);

const crew: TripCrew = {
  tripId: TRIP,
  crewId: 'c',
  crewName: 'The Bali Six',
  destinationId: null,
  destinationSlug: null,
  status: 'in_trip',
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  tz: 'Asia/Makassar',
  boosted: true,
  members: [MAYA, RIN, ALEX, JORDAN, DEV].map((uid, joinIndex) => ({
    uid,
    name: ['Maya', 'Rin', 'Alex', 'Jordan', 'Dev'][joinIndex] ?? '',
    joinIndex,
    phone: null,
  })),
  myShare: { id: 's', paused: false },
  meetup: null,
};

describe('live state', () => {
  it('drops a member the moment their share is paused, and ignores their late fixes', () => {
    let state = fromSnapshot(snapshot, NOW);
    expect(state.members.has(ALEX)).toBe(true);
    state = applyLiveMessage(
      state,
      {
        type: 'share.paused',
        data: {
          uid: ALEX,
          share_id: '0199a6f0-0000-7000-8000-0000000f0003',
          at: '2026-10-18T08:38:00Z',
        },
      },
      NOW,
    );
    expect(state.members.has(ALEX)).toBe(false);
    state = applyLiveMessage(
      state,
      {
        type: 'fixes',
        data: {
          share_id: '0199a6f0-0000-7000-8000-0000000f0003',
          reason: 'crew_map',
          fixes: [
            { uid: ALEX, lat: 1, lng: 1, acc: 5, at: '2026-10-18T08:38:01Z', activity: 'walking' },
          ],
        },
      },
      NOW,
    );
    expect(state.members.has(ALEX)).toBe(false);
  });

  it('forgets an ended share entirely', () => {
    const state = applyLiveMessage(
      fromSnapshot(snapshot, NOW),
      { type: 'share.ended', data: { uid: MAYA, share_id: 'x', reason: 'turned_off' } },
      NOW,
    );
    expect(state.members.has(MAYA)).toBe(false);
    expect(state.shares.has(MAYA)).toBe(false);
    expect(state.etas.has(MAYA)).toBe(false);
  });

  it('clears ETAs when the meet-up moves', () => {
    const state = fromSnapshot(snapshot, NOW);
    const moved = applyLiveMessage(
      state,
      {
        type: 'meetup.moved',
        data: { meetup: { ...snapshot.meetup!, place_name: 'Ubud Palace' } },
      },
      NOW,
    );
    expect(moved.etas.size).toBe(0);
    expect(moved.meetup?.place_name).toBe('Ubud Palace');
  });
});

describe('live view', () => {
  it('bunches Maya and Rin, keeps Alex and Jordan apart, and greys Jordan', () => {
    const view = buildLiveView({
      crew,
      state: fromSnapshot(snapshot, NOW),
      me: DEV,
      ownFix: null,
      now: NOW,
    });
    expect(
      view.pins.map((pin) =>
        pin.kind === 'bunch' ? pin.people.map((p) => p.name) : [pin.person.name],
      ),
    ).toEqual([['Maya', 'Rin'], ['Alex'], ['Jordan']]);
    const jordan = view.people.find((person) => person.uid === JORDAN);
    expect(jordan?.stale).toBe(true);
    expect(statusLine(jordan!, 'Asia/Makassar', 'en', NOW)).toBe('Last seen 12 min ago');
    const alex = view.people.find((person) => person.uid === ALEX);
    expect(statusLine(alex!, 'Asia/Makassar', 'en', NOW)).toBe('At Warung Pondok, 900 m');
  });
});

describe('glide', () => {
  it('glides over the time between fixes, at most 1.5 s, easing out', () => {
    const from = { lat: 0, lng: 0, at: 0 };
    expect(glideDuration(from, { lat: 1, lng: 1, at: 5000 })).toBe(MAX_GLIDE_MS);
    expect(glideDuration(from, { lat: 1, lng: 1, at: 800 })).toBe(800);
    expect(glideAt(from, { lat: 1, lng: 2, at: 1 }, 1)).toEqual([2, 1]);
    expect(glideAt(from, { lat: 1, lng: 2, at: 1 }, 0.5)[1]).toBeCloseTo(0.75);
  });
});

describe('trails', () => {
  it('keeps a scooter ride in memory only and draws it while it is fast', async () => {
    const spies = [...Object.values(Mmkv), ...Object.values(FileSystem)].filter(
      (value): value is jest.Mock => jest.isMockFunction(value),
    );
    expect(spies.length).toBeGreaterThan(0);
    for (const spy of spies) spy.mockClear();
    let trails = new Map();
    for (let i = 0; i < 20; i++) {
      trails = foldTrails(
        trails,
        new Map([
          [
            JORDAN,
            {
              uid: JORDAN,
              lat: -8.5095 + i * 0.0003,
              lng: 115.2795 - i * 0.0006,
              acc: 10,
              activity: 'automotive' as const,
              at: NOW + i * 5000,
            },
          ],
        ]),
      );
    }
    const drawn = visibleTrails(trails, NOW + 19 * 5000);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.coordinates.length).toBeGreaterThan(10);
    const none = new Map();
    const { result } = await renderHook(() => useTrails(none, NOW));
    expect(result.current).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
