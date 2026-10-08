/**
 * A control drawn under the 44 pt minimum keeps its drawn size in layout and reaches the target
 * through invisible touch slop, so it never pushes its neighbours apart.
 */
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { IconButton } from '../../buttons/IconButton';
import { renderUi } from '../../test-support/render';
import { MIN_TOUCH_TARGET } from '../../theme';
import { PressScale } from '../PressScale';

const layout = (width: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height } },
});
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style as StyleProp<ViewStyle>);

describe('touch target', () => {
  it('gives a 28 pt control 8 pt of slop on every side and no larger box', async () => {
    await renderUi(
      <PressScale testID="dot" accessibilityLabel="Dot" style={{ width: 28, height: 28 }} />,
    );
    const reach = (MIN_TOUCH_TARGET - 28) / 2;
    expect(screen.getByTestId('dot').props.hitSlop).toEqual({
      top: reach,
      bottom: reach,
      left: reach,
      right: reach,
    });
    expect(styleOf('dot')).not.toHaveProperty('minHeight');
    expect(styleOf('dot')).not.toHaveProperty('minWidth');
  });

  it('measures a control sized by its content and adds only the slop it needs', async () => {
    await renderUi(<PressScale testID="chip" accessibilityLabel="Beach" />);
    expect(screen.getByTestId('chip').props.hitSlop).toBeUndefined();
    await fireEvent(screen.getByTestId('chip'), 'layout', layout(120, 32));
    expect(screen.getByTestId('chip').props.hitSlop).toEqual({
      top: 6,
      bottom: 6,
      left: 0,
      right: 0,
    });
    await fireEvent(screen.getByTestId('chip'), 'layout', layout(120, 48));
    expect(screen.getByTestId('chip').props.hitSlop).toBeUndefined();
  });

  it('draws an icon button at the size asked for', async () => {
    await renderUi(<IconButton testID="close" label="Close" onPress={() => undefined} size={32} />);
    expect(styleOf('close')).toEqual(expect.objectContaining({ width: 32, height: 32 }));
    expect(screen.getByTestId('close').props.hitSlop).toEqual({
      top: 6,
      bottom: 6,
      left: 6,
      right: 6,
    });
  });
});
