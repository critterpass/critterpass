/**
 * Where to find a form over the real local-first stack: its places on the map, what it takes and
 * the steps, from the synced spawn rules; never the critter's name before it is found; a form
 * already found goes to its own page instead.
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
// The map is a native view: its pins render without it.
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
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import {
  DEST,
  seedCritters,
  SET_ID,
  TOKEK,
  TOKEK_EPIC,
  TOKEK_LEGENDARY,
  TOKEK_RARE,
  type CritterSeedOptions,
} from '../../test-support/seed-critters';
import { WhereScreen } from '../where-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const SUMMIT = '0192f000-0000-7000-8000-0000000b0001';
const EPIC_RULE = '0192f000-0000-7000-8000-0000000b0002';

const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
  jest.clearAllMocks();
});

async function renderWhere(formId: string, options: CritterSeedOptions = {}) {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid, options);
  await stack.db.execute(
    `INSERT INTO pois (id, destination_id, name, category, lat, lng)
     VALUES (?, ?, 'Batur summit', 'nature', -8.2422, 115.375)`,
    [SUMMIT, DEST],
  );
  await stack.db.execute(
    `INSERT INTO spawn_rules (id, key, form_id, kind, set_id, destination_id, poi_ids, geofences,
       dwell_s, solar, foreground_only, copy)
     VALUES (?, 'batur-sunrise', ?, 'presence', ?, ?, ?, '[]', 600, 'by_sunrise', 0, 'Batur')`,
    [EPIC_RULE, TOKEK_EPIC, SET_ID, DEST, JSON.stringify([SUMMIT])],
  );
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <WhereScreen formId={formId} />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('critters-where')).toBeTruthy());
}

describe('where to find a form', () => {
  it('shows its place on the map, what it takes and the steps, never its name', async () => {
    await renderWhere(TOKEK_EPIC);
    await waitFor(() => expect(screen.getByTestId('critters-where-map')).toBeTruthy());
    expect(screen.getByText('EPIC FORM')).toBeTruthy();
    expect(screen.getByText('Batur by sunrise')).toBeTruthy();
    expect(screen.getByText('Nearest: Batur summit')).toBeTruthy();
    expect(screen.getByText('Go to Batur summit.')).toBeTruthy();
    expect(
      screen.getByText('Be there around sunrise: from an hour before until just after.'),
    ).toBeTruthy();
    expect(screen.getByText('Stay about 10 minutes there, with CritterPass open.')).toBeTruthy();
    expect(screen.getByTestId('critters-where-directions')).toBeTruthy();
    expect(screen.queryByText(/tokek/iu)).toBeNull();
    expect(screen.queryByLabelText(/tokek/iu)).toBeNull();
  });

  it('gives the legendary its day and the crew it needs, with no place to send anyone', async () => {
    await renderWhere(TOKEK_LEGENDARY);
    await waitFor(() => expect(screen.getByTestId('critters-where-steps')).toBeTruthy());
    expect(
      screen.getByText('It only comes out on its day: Bali · all six on Batur by sunrise.'),
    ).toBeTruthy();
    expect(screen.getByText('Be there together, at least 6 of your crew at once.')).toBeTruthy();
    expect(screen.getByTestId('critters-where-none')).toBeTruthy();
    expect(screen.queryByTestId('critters-where-directions')).toBeNull();
  });

  it('sends a form already found to its own page', async () => {
    await renderWhere(TOKEK_RARE, { tokekFound: true });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/critters/[critterId]',
        params: { critterId: TOKEK },
      }),
    );
  });
});
