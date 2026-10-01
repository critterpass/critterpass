/**
 * The encounter screen over the real local-first stack: with an encounter under way it shows the
 * live scene for that spawn's form (read from synced rows), not the "nothing nearby" state.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { configure, render, screen, waitFor } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import type { EncounterEngine, EngineSnapshot } from '../../engine/engine';
import { setEncounterEngine } from '../../engine/session';
import {
  COPRESENCE_RULE,
  DEST,
  SET_ID,
  seedCritters,
  TOKEK,
  TOKEK_RARE,
  TRIP,
} from '../../test-support/seed-critters';
import { EncounterScreen } from '../encounter-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  setEncounterEngine(null);
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

const SNAPSHOT: EngineSnapshot = {
  encounterId: '0192f000-0000-7000-8000-0000000e0c01',
  phase: 'accruing',
  progress: 0.11,
  candidate: {
    rule: {
      id: COPRESENCE_RULE,
      key: 'temple-rare',
      form_id: TOKEK_RARE,
      kind: 'presence',
      set_id: SET_ID,
      destination_id: DEST,
      poi_ids: '[]',
      geofences: '[]',
      n: null,
      dwell_s: 300,
      hold_ms: null,
      window_id: null,
      solar: null,
      min_members: null,
      foreground_only: 1,
      copy: 'At a water temple',
      critter_id: TOKEK,
      rarity: 'rare',
    },
    spot: {
      poiId: null,
      placeKey: 'pools',
      name: 'Tirta Empul',
      radiusM: 50,
      lat: -8.41,
      lng: 115.31,
    },
    tripId: TRIP,
  },
  band: 'near',
  dwellS: 33,
  peakDwellS: 33,
  startedAt: Date.now(),
};

function engineAt(snapshot: EngineSnapshot): EncounterEngine {
  return {
    onFix: () => undefined,
    tick: () => undefined,
    befriend: () => Promise.resolve(false),
    abandon: () => undefined,
    dismiss: () => undefined,
    snapshot: () => snapshot,
    subscribe: () => () => undefined,
  } as unknown as EncounterEngine;
}

async function renderScreen(stack: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <EncounterScreen tz="Asia/Makassar" />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('encounter screen', () => {
  it('shows the scene for the encounter under way', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await seedCritters(stack.db, stack.uid);
    setEncounterEngine(engineAt(SNAPSHOT));
    await renderScreen(stack);
    await waitFor(() => expect(screen.getByTestId('critters-encounter-scene')).toBeTruthy());
    expect(screen.queryByTestId('critters-encounter-nothing')).toBeNull();
    // Tokek is the place's guide, so its name is public; the form's row adds it once loaded.
    await waitFor(() => expect(screen.getByText('TOKEK IS HERE')).toBeTruthy());
  });

  it('shows the scene even when the form has not reached this phone', async () => {
    const stack = await openTestLocalFirst({ holdUploads: true });
    stacks.push(stack);
    await seedCritters(stack.db, stack.uid);
    const candidate = SNAPSHOT.candidate;
    if (candidate === null) throw new Error('fixture');
    setEncounterEngine(
      engineAt({
        ...SNAPSHOT,
        candidate: {
          ...candidate,
          rule: {
            ...candidate.rule,
            form_id: '0192f000-0000-7000-8000-0000000fffff',
            critter_key: 'cp-112',
            critter_no: 112,
            canonical_seed: 7,
          },
        },
      }),
    );
    await renderScreen(stack);
    await waitFor(() => expect(screen.getByTestId('critters-encounter-scene')).toBeTruthy());
    expect(screen.getByText('SOMEONE IS HERE')).toBeTruthy();
  });
});
