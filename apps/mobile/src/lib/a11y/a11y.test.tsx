import { i18n } from '@lingui/core';
import { act, render, screen } from '@testing-library/react-native';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';

import { ThemeProvider } from '@/lib/theme';

import { critterLabel, guideLabel, lockedCritterLabel } from './labels';
import { fontScaleInfo, useFontScale } from './use-font-scale';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('spoken labels', () => {
  it('names critters, guides and locked locals the way the design system words them', () => {
    expect(critterLabel('Tokek', 'temple')).toBe('Tokek, temple form');
    expect(guideLabel('Tokek', 'waving')).toBe('Tokek, waving');
    expect(lockedCritterLabel('Kyoto')).toBe('Undiscovered local, found by being in Kyoto');
  });
});

describe('large text', () => {
  it('classifies font scales from default up to the AX3 ceiling', () => {
    expect(fontScaleInfo(1)).toEqual({ scale: 1, isLarge: false, isMax: false });
    expect(fontScaleInfo(1.5)).toEqual({ scale: 1.5, isLarge: true, isMax: false });
    expect(fontScaleInfo(2)).toEqual({ scale: 2, isLarge: true, isMax: true });
  });

  it('reads the scale from the nearest theme provider', async () => {
    function Probe() {
      const { scale, isMax } = useFontScale();
      return <Text>{`${String(scale)} ${String(isMax)}`}</Text>;
    }
    await render(
      <ThemeProvider fontScale={3}>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('2 true')).toBeTruthy();
  });
});
