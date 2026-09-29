/**
 * The panel's actions over the real local-first stack and command client, with the api as the
 * network boundary: a meet-up moved offline waits in the queue (the pin marked pending) and is
 * sent once the phone is back; pausing queues the command; PING ALL answers with the island toast.
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
jest.mock('@/data/places/usePlaceSearch', () => ({
  usePlaceSearch: () => ({ places: [], loading: false, error: null, source: 'none' }),
}));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ tripId: '0199a6f0-0000-7000-8000-00000000e001' })),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';
import { toastQueue } from '@/motion/island-toast';

import {
  DEV,
  fakeServices,
  MEETUP,
  recordedSnapshot,
  renderLiveMap,
  seedTrip,
} from '../test-support/live-map-harness';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

interface Sent {
  readonly path: string;
  readonly body: { ops?: { op_id: string; cmd: string; payload: unknown }[]; payload?: unknown };
}

/** The api at the network boundary: refuses while offline, applies every op once back. */
function apiDouble(): SyncTransport & { online: boolean; sent: Sent[] } {
  const api = {
    online: false,
    sent: [] as Sent[],
    postJson(path: string, body: unknown) {
      if (!api.online) return Promise.reject(new Error('network down'));
      const sent = body as Sent['body'];
      api.sent.push({ path, body: sent });
      if (path === '/sync/upload') {
        return Promise.resolve({
          status: 200,
          body: { results: (sent.ops ?? []).map((op) => ({ op_id: op.op_id, status: 'applied' })) },
        });
      }
      return Promise.resolve({
        status: 200,
        body: {
          status: 'applied',
          result: {
            kind: 'ping',
            eta_min: null,
            place_name: 'Campuhan Ridge',
            meet_at: '2026-10-18T09:00:00Z',
          },
        },
      });
    },
  };
  return api;
}

describe('meet-up changes offline', () => {
  it('queues a move while offline, shows it pending, and sends it once back', async () => {
    const api = apiDouble();
    stack = await openTestLocalFirst({ uid: DEV, transport: api });
    await seedTrip(stack);
    stack.network.set(false);
    await renderLiveMap(stack, fakeServices({ answer: null }));

    await fireEvent.press(await screen.findByTestId('live-move-it'));
    await fireEvent.press(await screen.findByText(/^in 15 min$/i));
    await fireEvent.press(screen.getByTestId('live-meetup-confirm'));

    await waitFor(async () => {
      const rows = await stack!.db.getAll("SELECT 1 FROM commands WHERE cmd = 'move_meetup'");
      expect(rows).toHaveLength(1);
    });
    expect(await screen.findByTestId('live-meetup-pending')).toBeTruthy();

    api.online = true;
    stack.network.set(true);
    await stack.value.queue.flush();
    await waitFor(() =>
      expect(api.sent.some((call) => call.body.ops?.some((op) => op.cmd === 'move_meetup'))).toBe(
        true,
      ),
    );
    const move = api.sent
      .flatMap((call) => call.body.ops ?? [])
      .find((op) => op.cmd === 'move_meetup');
    expect(move?.payload).toMatchObject({ meetup_id: MEETUP });
  });
});

describe('pause and ping', () => {
  it('queues a pause from your own row', async () => {
    stack = await openTestLocalFirst({ uid: DEV, holdUploads: true });
    await seedTrip(stack);
    await renderLiveMap(stack, fakeServices({ answer: recordedSnapshot() }));
    await fireEvent.press(await screen.findByTestId('live-pause-chip'));
    await waitFor(async () => {
      const rows = await stack!.db.getAll<{ envelope: string }>(
        "SELECT envelope FROM commands WHERE cmd = 'pause_location_share'",
      );
      expect(rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload)).toEqual(
        [{ share_id: '0199a6f0-0000-7000-8000-0000000f0005', paused: true }],
      );
    });
  });

  it('pings everyone and says so', async () => {
    const api = apiDouble();
    api.online = true;
    stack = await openTestLocalFirst({ uid: DEV, transport: api });
    await seedTrip(stack);
    const shown: string[] = [];
    const stop = toastQueue.subscribe(() => {
      const current = toastQueue.getCurrent();
      if (current !== null) shown.push(current.title);
    });
    await renderLiveMap(stack, fakeServices({ answer: recordedSnapshot() }));
    await screen.findByText(/^meet-up · 17:00$/i);
    await fireEvent.press(screen.getByTestId('live-ping-all'));
    await waitFor(() => expect(shown).toContain('Pinged everyone: Campuhan Ridge at 17:00.'));
    stop();
  });
});
