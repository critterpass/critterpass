// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Alert, StyleSheet, View } from 'react-native';
import type { AlertButton, StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { PillButton } from '../buttons/PillButton';
import { CodeBoxes, groupFitSize } from '../inputs/CodeBoxes';
import { HoldRing } from '../inputs/HoldRing';
import { applyKey, Keypad } from '../inputs/Keypad';
import { KeypadAmount } from '../inputs/KeypadAmount';
import { LanguageRow } from '../inputs/LanguageRow';
import { RadioCard } from '../inputs/RadioCard';
import { RangePrivateMarkers } from '../inputs/RangePrivateMarkers';
import { SearchField } from '../inputs/SearchField';
import { Segmented } from '../inputs/Segmented';
import { SegmentBudget } from '../inputs/SegmentBudget';
import { SlideToConfirm } from '../inputs/SlideToConfirm';
import { Slider } from '../inputs/Slider';
import { TextField } from '../inputs/TextField';
import { Toggle } from '../inputs/Toggle';
import { renderUi } from '../test-support/render';

const action = (actionName: string) => ({ nativeEvent: { actionName } });
const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', action('activate'));

describe('buttons', () => {
  it('exposes pill buttons with busy and disabled state and activates them', async () => {
    const onPress = jest.fn();
    await renderUi(
      <View>
        <PillButton label="Save my pass" onPress={onPress} sheen />
        <PillButton label="Sending" onPress={onPress} loading />
        <PillButton label="Pick a date first" onPress={onPress} disabled />
      </View>,
    );
    await activate(screen.getByRole('button', { name: 'Save my pass' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending' }).props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    const disabled = screen.getByRole('button', { name: 'Pick a date first' });
    expect(disabled.props.accessibilityState).toMatchObject({ disabled: true });
    expect(disabled.props.accessibilityActions).toEqual([]);
  });

  it('sets a sentence-case label as written instead of uppercasing it', async () => {
    await renderUi(
      <View>
        <PillButton label="Continue with Google" onPress={jest.fn()} casing="sentence" />
        <PillButton label="Send code" onPress={jest.fn()} />
      </View>,
    );
    expect(screen.getByText('Continue with Google')).toBeTruthy();
    expect(screen.getByText('SEND CODE')).toBeTruthy();
  });
});

describe('inputs', () => {
  it('announces a toggle as a switch with an On/Off value', async () => {
    const onValueChange = jest.fn();
    await renderUi(<Toggle label="Talk out loud" value={false} onValueChange={onValueChange} />);
    const toggle = screen.getByRole('switch', { name: 'Talk out loud', checked: false });
    expect(toggle.props.accessibilityValue).toEqual({ text: 'Off' });
    await activate(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('treats segmented options and radio cards as radios', async () => {
    const onChange = jest.fn();
    const onSelect = jest.fn();
    await renderUi(
      <View>
        <Segmented
          label="Split"
          value="evenly"
          onChange={onChange}
          segments={[
            { value: 'evenly', label: 'Evenly' },
            { value: 'custom', label: 'Custom', badge: 2 },
          ]}
        />
        <RadioCard title="Ryokan" pickTag="Pon's pick" selected={false} onSelect={onSelect} />
        <LanguageRow
          locale="vi"
          nativeName="Tiếng Việt"
          localName="Vietnamese"
          selected
          onSelect={onSelect}
        />
      </View>,
    );
    const evenly = screen.getByRole('radio', { name: 'Evenly', checked: true });
    // The selected segment is cream with ink text, as in 3b-4, 3e-1 and 4e-1.
    expect(StyleSheet.flatten(evenly.props.style)).toMatchObject({
      backgroundColor: tokens.semantic.text.primary,
    });
    await activate(screen.getByRole('radio', { name: 'Custom, 2', checked: false }));
    expect(onChange).toHaveBeenCalledWith('custom');
    await activate(screen.getByRole('radio', { name: "Ryokan, Pon's pick", checked: false }));
    expect(
      screen.getByRole('radio', { name: 'Tiếng Việt, Vietnamese', checked: true }),
    ).toBeTruthy();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('fills the selected segment yellow when asked (3i-2 split)', async () => {
    await renderUi(
      <Segmented
        label="Split"
        value="evenly"
        onChange={jest.fn()}
        selectedTone="yellow"
        segments={[
          { value: 'evenly', label: 'Evenly' },
          { value: 'custom', label: 'Custom' },
        ]}
      />,
    );
    const evenly = screen.getByRole('radio', { name: 'Evenly', checked: true });
    expect(StyleSheet.flatten(evenly.props.style)).toMatchObject({
      backgroundColor: tokens.semantic.action.primary,
    });
  });

  it('labels text fields, reports errors and clears', async () => {
    const onChangeText = jest.fn();
    await renderUi(
      <TextField
        label="Email"
        value="win@"
        onChangeText={onChangeText}
        status="error"
        message="That email bounced"
      />,
    );
    const input = screen.getByLabelText('Email');
    expect(input.props['aria-invalid']).toBe(true);
    expect(input.props.accessibilityHint).toBe('That email bounced');
    await fireEvent.changeText(input, 'win@x.io');
    expect(onChangeText).toHaveBeenLastCalledWith('win@x.io');
    await activate(screen.getByRole('button', { name: 'Clear' }));
    expect(onChangeText).toHaveBeenLastCalledWith('');
  });

  it('shows search results only while there is a query', async () => {
    const results = <View testID="results" />;
    const { rerender } = await renderUi(
      <SearchField value="" onChangeText={jest.fn()} label="Search places" results={results} />,
    );
    expect(screen.queryByTestId('results')).toBeNull();
    await rerender(
      <SearchField value="ubud" onChangeText={jest.fn()} label="Search places" results={results} />,
    );
    expect(screen.getByLabelText('Search places').props.accessibilityRole).toBe('search');
    expect(screen.getByTestId('results')).toBeTruthy();
  });

  it('cleans code input, completes a full code and flags an invalid one', async () => {
    const onChangeText = jest.fn();
    const onComplete = jest.fn();
    const { rerender } = await renderUi(
      <CodeBoxes
        label="Verification code"
        value=""
        onChangeText={onChangeText}
        onComplete={onComplete}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '48 29-13');
    expect(onChangeText).toHaveBeenCalledWith('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
    await rerender(
      <CodeBoxes
        label="Gift code"
        value=""
        onChangeText={onChangeText}
        groups={[4, 4, 4]}
        status="invalid"
      />,
    );
    const gift = screen.getByLabelText('Gift code');
    expect(gift.props['aria-invalid']).toBe(true);
    await fireEvent.changeText(gift, 'ab12-cd34-ef56-gh');
    expect(onChangeText).toHaveBeenLastCalledWith('AB12CD34EF56');
  });

  it('fits a gift code group to its box, and stacks the groups when that would be too small', async () => {
    // Four bold capitals in a 100 pt box with 20 pt of padding and border: 80 / (4 × .72).
    expect(groupFitSize(100, 4, 20)).toBeCloseTo(27.78, 1);
    await renderUi(
      <CodeBoxes
        value="PASS7K2QMAYA"
        onChangeText={() => {}}
        groups={[4, 4, 4]}
        label="Gift code"
        testID="gift"
      />,
    );
    const cellsNode = () => screen.getByTestId('gift-cells', { includeHiddenElements: true });
    const direction = () =>
      StyleSheet.flatten(cellsNode().props.style as StyleProp<ViewStyle>)?.flexDirection;
    const layoutAt = (width: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 60 } },
    });
    await fireEvent(cellsNode(), 'layout', layoutAt(330));
    expect(direction()).toBe('row');
    // Each group is set at the size that fills its box, never cut to "PA…".
    const pass = screen.getByText('PASS', { includeHiddenElements: true });
    const size = StyleSheet.flatten(
      pass.props.style as StyleProp<ViewStyle & { fontSize?: number }>,
    )?.fontSize;
    expect(size).toBeLessThanOrEqual(24);
    expect(size).toBeGreaterThan(16);
    // So narrow that side by side each group would drop below a readable size.
    await fireEvent(cellsNode(), 'layout', layoutAt(150));
    expect(direction()).toBe('column');
  });

  it('builds amounts from keypad keys', async () => {
    expect(applyKey('', '0')).toBe('');
    expect(applyKey('45', '000')).toBe('45000');
    expect(applyKey('45000', 'delete')).toBe('4500');
    expect(applyKey('123456789012', '3')).toBe('123456789012');
    const onKey = jest.fn();
    await renderUi(
      <View>
        <KeypadAmount value={450000} currency="Rp" approx="≈ $28.42" label="Rp 450,000" />
        <Keypad onKey={onKey} />
      </View>,
    );
    await activate(screen.getByRole('keyboardkey', { name: '7' }));
    await activate(screen.getByRole('keyboardkey', { name: 'Three zeros' }));
    await activate(screen.getByRole('keyboardkey', { name: 'Delete' }));
    expect(onKey.mock.calls).toEqual([['7'], ['000'], ['delete']]);
    expect(screen.getByLabelText('Rp 450,000, ≈ $28.42')).toBeTruthy();
  });

  it('renders the keypad amount where Intl has no formatToParts (Hermes on iOS)', async () => {
    const formatToParts = jest
      .spyOn(Intl.NumberFormat.prototype, 'formatToParts')
      .mockImplementation(() => {
        throw new TypeError('formatToParts is not supported');
      });
    try {
      await renderUi(
        <KeypadAmount value={450000} currency="Rp" approx="≈ $28.42" label="Rp 450,000" />,
      );
      expect(screen.getByLabelText('Rp 450,000, ≈ $28.42')).toBeTruthy();
    } finally {
      formatToParts.mockRestore();
    }
  });

  it('adjusts sliders and segment budgets by screen-reader actions', async () => {
    const onSlide = jest.fn();
    const onBudget = jest.fn();
    await renderUi(
      <View>
        <Slider label="Music" value={0.6} onChange={onSlide} />
        <SegmentBudget label="Pings" value={4} onChange={onBudget} />
      </View>,
    );
    const slider = screen.getByRole('adjustable', { name: 'Music' });
    expect(slider.props.accessibilityValue).toMatchObject({ now: 60, text: '60%' });
    await fireEvent(slider, 'accessibilityAction', action('increment'));
    expect(onSlide).toHaveBeenCalledWith(0.7);
    const budget = screen.getByRole('adjustable', { name: 'Pings' });
    expect(budget.props.accessibilityValue).toMatchObject({ now: 4, max: 10, text: '4 of 10' });
    await fireEvent(budget, 'accessibilityAction', action('decrement'));
    expect(onBudget).toHaveBeenCalledWith(3);
  });

  it('reads private budget markers only as their summary', async () => {
    await renderUi(
      <RangePrivateMarkers
        min={800}
        max={2500}
        markers={[1500, 2000]}
        sweetSpot={1350}
        minLabel="$800"
        maxLabel="$2,500"
        summary="Sweet spot $1,350 each, under all 2 maxes"
      />,
    );
    expect(screen.getByLabelText('Sweet spot $1,350 each, under all 2 maxes')).toBeTruthy();
    expect(screen.queryByText('1500')).toBeNull();
  });

  it('confirms a slide and a hold through their accessibility actions', async () => {
    const onConfirm = jest.fn();
    const onComplete = jest.fn();
    await renderUi(
      <View>
        <SlideToConfirm label="Slide to board" actionLabel="Board" onConfirm={onConfirm} />
        <HoldRing label="Hold" actionLabel="Befriend" onComplete={onComplete} />
      </View>,
    );
    const slide = screen.getByRole('button', { name: 'Slide to board' });
    expect(slide.props.accessibilityActions).toEqual([{ name: 'activate', label: 'Board' }]);
    await activate(slide);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await activate(screen.getByRole('button', { name: 'Befriend' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('asks before a destructive hold commits without the gesture', async () => {
    const onComplete = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderUi(
      <HoldRing
        label="SOS"
        actionLabel="Send SOS"
        tone="pink"
        confirmMessage="Alert your crew?"
        onComplete={onComplete}
      />,
    );
    await activate(screen.getByRole('button', { name: 'Send SOS' }));
    expect(onComplete).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Send SOS']);
    buttons[1]?.onPress?.();
    expect(onComplete).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
