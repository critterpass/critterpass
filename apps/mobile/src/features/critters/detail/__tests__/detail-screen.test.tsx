/**
 * Critter detail over the real local-first stack: the guide's own critter can wear an owned form
 * (queued `set_guide_skin`, and the guide's look changes at once wherever `useGuideSkin` draws
 * it), a locked form can never be picked, and a local critter offers no guide button.
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
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { useGuideSkin } from '../..';
import {
  CHEP,
  GUIDE,
  seedCritters,
  TOKEK,
  TOKEK_COMMON,
  TOKEK_RARE,
} from '../../test-support/seed-critters';
import { DetailScreen } from '../detail-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

/** Stands in for the guide chat header: draws the guide in whatever look it wears. */
function GuideLook() {
  const skin = useGuideSkin('tokek');
  return <Text testID="guide-look">{skin?.rarity ?? 'classic'}</Text>;
}

async function renderDetail(critterId: string): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid, { tokekFound: true });
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <LocalFirstProvider value={stack.value}>
            <ScreenJoltProvider>
              <DetailScreen critterId={critterId} />
              <GuideLook />
            </ScreenJoltProvider>
          </LocalFirstProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('critters-detail')).toBeTruthy());
  return stack;
}

async function queued(stack: TestLocalFirst): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    "SELECT envelope FROM commands WHERE cmd = 'set_guide_skin' ORDER BY seq",
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

describe('critter detail', () => {
  it('makes an owned form the guide’s look, and each owned form in turn', async () => {
    const stack = await renderDetail(TOKEK);
    await waitFor(() => expect(screen.getByText('TEMPLE TOKEK')).toBeTruthy());
    expect(screen.getByTestId('guide-look').props.children).toBe('classic');
    await fireEvent.press(screen.getByTestId('critters-detail-make-guide'));
    await waitFor(() => expect(screen.getByTestId('guide-look').props.children).toBe('rare'));
    expect(screen.getByTestId('critters-detail-classic')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Common'));
    await waitFor(() => expect(screen.getByTestId('critters-detail-make-guide')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('critters-detail-make-guide'));
    await waitFor(() => expect(screen.getByTestId('guide-look').props.children).toBe('common'));
    await waitFor(async () =>
      expect(await queued(stack)).toEqual([
        { guide_id: GUIDE, form_id: TOKEK_RARE },
        { guide_id: GUIDE, form_id: TOKEK_COMMON },
      ]),
    );
  });

  it('never picks a locked form', async () => {
    const stack = await renderDetail(TOKEK);
    await waitFor(() => expect(screen.getByText('TEMPLE TOKEK')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Epic, locked: Batur by sunrise'));
    expect(screen.getByText('TEMPLE TOKEK')).toBeTruthy();
    expect(await queued(stack)).toEqual([]);
  });

  it('offers no guide look for a local critter, only sharing', async () => {
    await renderDetail(CHEP);
    await waitFor(() => expect(screen.getByText('CHÉP')).toBeTruthy());
    expect(screen.queryByTestId('critters-detail-make-guide')).toBeNull();
    expect(screen.getByTestId('critters-detail-share')).toBeTruthy();
  });
});
