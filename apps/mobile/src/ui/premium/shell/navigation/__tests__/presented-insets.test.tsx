import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { presentedScreenLayout, presentedTopInset, SHEET_TOP_CLEARANCE } from '../presented-insets';

const WINDOW = { top: 59, bottom: 34, left: 0, right: 0 };

function Insets() {
  const insets = useSafeAreaInsets();
  return <Text testID="insets">{`${insets.top}/${insets.bottom}`}</Text>;
}

async function laidOut(presentation: 'formSheet' | 'modal' | 'card', first: boolean) {
  const navigation = { getState: () => ({ routes: first ? [{ key: 'me' }] : [{ key: 'under' }] }) };
  await render(
    <SafeAreaProvider
      initialMetrics={{ insets: WINDOW, frame: { x: 0, y: 0, width: 393, height: 852 } }}
    >
      {presentedScreenLayout({
        route: { key: 'me' },
        navigation,
        options: { presentation },
        children: <Insets />,
      })}
    </SafeAreaProvider>,
  );
  return String(screen.getByTestId('insets').props.children);
}

describe('insets inside a presented sheet', () => {
  it('starts a sheet at the grabber band and keeps the window bottom', async () => {
    expect(await laidOut('formSheet', false)).toBe(`${SHEET_TOP_CLEARANCE}/34`);
  });

  it('keeps the window insets for a pushed page', async () => {
    expect(await laidOut('card', false)).toBe('59/34');
  });

  it("leaves a stack's first screen to the navigator that presented its group", async () => {
    // Android rises a group opened on a sheet route as a page under the status bar.
    expect(await laidOut('formSheet', true)).toBe('59/34');
  });

  it('treats the page sheet as a sheet on iOS only', () => {
    expect(presentedTopInset({ presentation: 'modal' }, 'ios')).toBe(SHEET_TOP_CLEARANCE);
    expect(presentedTopInset({ presentation: 'modal' }, 'android')).toBeUndefined();
    expect(presentedTopInset({ presentation: 'fullScreenModal' }, 'ios')).toBeUndefined();
    expect(presentedTopInset({ presentation: 'transparentModal' }, 'ios')).toBeUndefined();
  });
});
