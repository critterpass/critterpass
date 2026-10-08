/**
 * A loading pill keeps its label laid out (unseen) under the spinner, so a small pill keeps its
 * width and the controls beside it do not jump.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { PillButton } from '../PillButton';
import { renderUi } from '../../test-support/render';

describe('loading pill', () => {
  it('keeps its label laid out at zero opacity, so a small pill keeps its width', async () => {
    await renderUi(<PillButton label="Save" size="sm" onPress={() => undefined} loading />);
    const label = screen.getByText('SAVE', { includeHiddenElements: true });
    const opacities: number[] = [];
    for (let node = label.parent; node; node = node.parent) {
      const opacity = StyleSheet.flatten(node.props.style as StyleProp<ViewStyle>)?.opacity;
      if (typeof opacity === 'number') opacities.push(opacity);
    }
    expect(opacities).toContain(0);
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true }),
    );
  });
});
