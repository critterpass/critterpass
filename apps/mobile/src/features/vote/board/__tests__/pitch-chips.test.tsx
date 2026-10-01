/**
 * The pitch card's chips (3b-3): the design sets every chip on one line and wraps the row, so an
 * event the guide named at length ("Hội An full-moon lantern night (14th of the lunar month)") ends
 * in an ellipsis inside the card instead of wrapping its chip onto a second line.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('../fade-section', () => ({
  FadeSection: ({ children }: { children: unknown }) => children,
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { EMPTY_PITCH, type PitchState } from '../../data/use-pitch-stream';
import { renderVote } from '../../test-support/vote-harness';
import { PitchCard } from '../pitch-stream';

const EVENT = 'Hội An full-moon lantern night (14th of the lunar month)';

const PITCH: PitchState = {
  ...EMPTY_PITCH,
  phase: 'done',
  sticker: {
    placeId: 'p-1',
    name: 'Hội An',
    country: 'Vietnam',
    coverage: 'guest',
    guide: 'tokek',
  },
  headline: 'Hội An by lantern light',
  chips: [
    { kind: 'flight', minutes: 180, origin: 'SIN' },
    { kind: 'event', name: EVENT },
  ],
};

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('pitch card chips', () => {
  it('keeps a long event chip on one line inside the card, in a row that wraps', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await renderVote(
      <PitchCard state={PITCH} people={new Map()} onRetry={() => undefined} />,
      stack,
    );
    const label = screen.getByText(EVENT.toLocaleUpperCase('en'));
    // One line, cut with an ellipsis; the chip never grows past the row.
    expect(label.props.numberOfLines).toBe(1);
    const pill = StyleSheet.flatten(label.parent?.props.style as StyleProp<ViewStyle>);
    expect(pill?.maxWidth).toBe('100%');
    const row = StyleSheet.flatten(
      screen.getByTestId('pitch-chips').props.style as StyleProp<ViewStyle>,
    );
    expect(row?.flexWrap).toBe('wrap');
    // The short chip beside it is one line too.
    expect(screen.getByText('3H FROM SIN').props.numberOfLines).toBe(1);
  });
});
