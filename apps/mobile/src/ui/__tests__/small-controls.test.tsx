/**
 * Small controls hold their place: a loading pill keeps its label laid out (unseen) so it keeps its
 * width, and every iPhone number pad shares one Done bar that puts the keyboard away.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Keyboard, Platform, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { PillButton } from '../buttons/PillButton';
import { NUMBER_PAD_DONE_ID } from '../inputs/NumberPadDone';
import { TextField } from '../inputs/TextField';
import { renderUi } from '../test-support/render';

const ACTIVATE = { nativeEvent: { actionName: 'activate' } };

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

describe('number pad Done key', () => {
  it('mounts one Done bar for every number field and dismisses the keyboard', async () => {
    expect(Platform.OS).toBe('ios');
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await renderUi(
      <>
        <TextField
          label="Amount"
          value=""
          onChangeText={() => undefined}
          keyboardType="decimal-pad"
        />
        <TextField label="Nights" value="" onChangeText={() => undefined} inputMode="numeric" />
        <TextField label="Name" value="" onChangeText={() => undefined} />
      </>,
    );
    expect(screen.getAllByTestId('number-pad-done')).toHaveLength(1);
    expect(screen.getByLabelText('Amount').props.inputAccessoryViewID).toBe(NUMBER_PAD_DONE_ID);
    expect(screen.getByLabelText('Nights').props.inputAccessoryViewID).toBe(NUMBER_PAD_DONE_ID);
    expect(screen.getByLabelText('Name').props.inputAccessoryViewID).toBeUndefined();
    await fireEvent(screen.getByTestId('number-pad-done'), 'accessibilityAction', ACTIVATE);
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('hands the bar to the next number field when the first one leaves', async () => {
    const field = (label: string) => (
      <TextField
        key={label}
        label={label}
        value=""
        onChangeText={() => undefined}
        keyboardType="number-pad"
      />
    );
    const view = await renderUi(
      <>
        {field('First')}
        {field('Second')}
      </>,
    );
    await view.rerender(<>{field('Second')}</>);
    expect(screen.getAllByTestId('number-pad-done')).toHaveLength(1);
  });
});
