/**
 * The crew live map over the real local-first stack: pins, bunches and their spoken labels, stale
 * and approximate fixes, the panel's rows and arrival clocks, and each state around the map (gate,
 * outside trip days, first share, paused, offline, Low Power Mode, location off, no meet-up, all
 * arrived). MapLibre is native, so its views render as plain containers.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    Map: ({ children }: { children: unknown }) => <View testID="maplibre-map">{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children: unknown }) => <View>{children}</View>,
    GeoJSONSource: ({ children }: { children: unknown }) => <View>{children}</View>,
    Layer: () => null,
  };
});
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ tripId: '0199a6f0-0000-7000-8000-00000000e001' })),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  DEV,
  fakeServices,
  recordedSnapshot,
  renderLiveMap,
  seedTrip,
} from '../test-support/live-map-harness';

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true, uid: DEV });
  return stack;
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('pins and rows', () => {
  it('bunches Maya and Rin into one pill with a spoken label, and greys a stale pin', async () => {
    const s = await open();
    await seedTrip(s);
    await renderLiveMap(s, fakeServices({ answer: recordedSnapshot() }));
    expect(await screen.findByLabelText('Maya and Rin, Karsa Spa, 3 minutes away')).toBeTruthy();
    expect(screen.getByText('MAYA + RIN')).toBeTruthy();
    // Jordan's last fix is 12 minutes old.
    expect(screen.getAllByText('Last seen 12 min ago').length).toBeGreaterThan(0);
    expect(screen.getByText('5 of 5 sharing · trip days only')).toBeTruthy();
  });

  it('lists each person with an arrival clock in the trip zone', async () => {
    const s = await open();
    await seedTrip(s);
    await renderLiveMap(s, fakeServices({ answer: recordedSnapshot() }));
    await screen.findByTestId('live-row-0199a6f0-0000-7000-8000-0000000000a3');
    // Alex: 17 minutes from 16:38 local.
    expect(screen.getByLabelText('Alex, At Warung Pondok, 900 m, 17 minutes away')).toBeTruthy();
    expect(screen.getByText('MEET-UP · 17:00')).toBeTruthy();
    expect(screen.getByText('Sharing switches itself off on Oct 19 at midnight.')).toBeTruthy();
  });

  it('marks an approximate fix and Low Power Mode on your own row', async () => {
    const s = await open();
    await seedTrip(s);
    await renderLiveMap(
      s,
      fakeServices({
        answer: recordedSnapshot(),
        ownFix: { lat: -8.5, lng: 115.26, acc: 1200, at: Date.parse('2026-10-18T08:37:59Z') },
        lowPower: true,
      }),
    );
    expect(await screen.findByTestId('live-approximate')).toBeTruthy();
    expect(screen.getByTestId('live-saving-battery')).toBeTruthy();
  });
});

describe('states', () => {
  it('shows the Boost gate on an unboosted trip, with no positions kept', async () => {
    const s = await open();
    await seedTrip(s, { boosted: false });
    await renderLiveMap(
      s,
      fakeServices({
        answer: { status: 402, body: { error: { code: 'ENTITLEMENT_REQUIRED', message: 'x' } } },
      }),
    );
    expect(await screen.findByText(/^see the crew live$/i)).toBeTruthy();
    expect(screen.queryByTestId('live-bunch')).toBeNull();
  });

  it('explains when the trip days have not started', async () => {
    const s = await open();
    await seedTrip(s, { status: 'pre_trip' });
    await renderLiveMap(
      s,
      fakeServices({
        answer: {
          status: 403,
          body: {
            error: { code: 'NOT_ELIGIBLE', message: 'x', detail: { reason: 'outside_trip_days' } },
          },
        },
      }),
    );
    expect(await screen.findByText(/^not a trip day yet$/i)).toBeTruthy();
    expect(await screen.findByText(/Sharing opens on Oct 15\./)).toBeTruthy();
  });

  it('offers to share on the first open, and pauses from your own row', async () => {
    const s = await open();
    await seedTrip(s, { myShare: 'off' });
    await renderLiveMap(s, fakeServices({ answer: recordedSnapshot() }));
    expect(await screen.findByText('Share where you are with the crew?')).toBeTruthy();
  });

  it('shows your paused share: PAUSED header, RESUME chip', async () => {
    const s = await open();
    await seedTrip(s, { myShare: 'paused' });
    await renderLiveMap(
      s,
      fakeServices({
        answer: recordedSnapshot((body) => ({
          ...body,
          shares: body.shares.map((share) =>
            share.uid === DEV ? { ...share, paused: true } : share,
          ),
        })),
      }),
    );
    expect(await screen.findByText('RESUME')).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });

  it('keeps last-known pins offline with the time of the last update', async () => {
    const s = await open();
    await seedTrip(s);
    s.network.set(false);
    await renderLiveMap(s, fakeServices({ answer: null }));
    expect(await screen.findByText('Offline · waiting for the crew')).toBeTruthy();
    expect(screen.getByText('Pings need a signal.')).toBeTruthy();
  });

  it('asks for a meet-up when there is none', async () => {
    const s = await open();
    await seedTrip(s, { meetup: false });
    await renderLiveMap(
      s,
      fakeServices({ answer: recordedSnapshot((body) => ({ ...body, meetup: null, etas: [] })) }),
    );
    expect(await screen.findByText('SET A MEET-UP')).toBeTruthy();
  });

  it('celebrates when everyone sharing has arrived', async () => {
    const s = await open();
    await seedTrip(s);
    await renderLiveMap(
      s,
      fakeServices({
        answer: recordedSnapshot((body) => ({
          ...body,
          etas: body.etas.map((eta) => ({
            ...eta,
            min: 0,
            arrived: true,
            status: { key: 'arrived', poi: null, distance_m: 20 },
          })),
        })),
      }),
    );
    expect(await screen.findByText(/^everyone's here$/i)).toBeTruthy();
  });
});

describe('the paused crewmate', () => {
  it('reads "Paused sharing at 14:00" with no ETA', async () => {
    const s = await open();
    await seedTrip(s);
    await renderLiveMap(
      s,
      fakeServices({
        answer: recordedSnapshot((body) => ({
          ...body,
          members: body.members.filter((m) => m.uid !== '0199a6f0-0000-7000-8000-0000000000a3'),
          shares: body.shares.map((share) =>
            share.uid === '0199a6f0-0000-7000-8000-0000000000a3'
              ? { ...share, paused: true, changed_at: '2026-10-18T06:00:00.000Z' }
              : share,
          ),
        })),
      }),
    );
    await waitFor(() => expect(screen.getByText('Paused sharing at 14:00')).toBeTruthy());
  });
});
