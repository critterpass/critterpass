import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  insideCardTopInset,
  presentedScreenLayout,
  presentedTopInset,
  SHEET_TOP_CLEARANCE,
} from '../presented-insets';

const WINDOW = { top: 59, bottom: 34, left: 0, right: 0 };

function Insets() {
  const insets = useSafeAreaInsets();
  return <Text testID="insets">{`${insets.top}/${insets.bottom}`}</Text>;
}

async function laidOut(presentation: 'formSheet' | 'modal' | 'card', first: boolean) {
  await renderLayout(presentation, first);
  return String(screen.getByTestId('insets').props.children);
}

async function renderLayout(presentation: 'formSheet' | 'modal' | 'card', first: boolean) {
  const navigation = { getState: () => ({ routes: first ? [{ key: 'me' }] : [{ key: 'under' }] }) };
  return render(
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
}

/** Whether the layout starts the screen with the empty stop view, ahead of its content. */
async function startsWithStop(presentation: 'formSheet' | 'modal' | 'card', first: boolean) {
  await renderLayout(presentation, first);
  const stop = screen.queryByTestId('scroll-walk-stop');
  if (stop === null) return false;
  const content = screen.getByTestId('insets');
  const siblings = stop.parent?.children ?? [];
  return siblings[0] === stop && siblings.includes(content) && stop.children.length === 0;
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

  it('lays a page pushed after a sheet out from the sheet top on iOS', () => {
    const routes = [{ key: 'tabs' }, { key: 'paywall' }, { key: 'compare' }, { key: 'page' }];
    const shown = (route: { readonly key: string }) =>
      route.key === 'paywall' ? ('formSheet' as const) : undefined;
    expect(insideCardTopInset(routes, 'page', shown, 'ios')).toBe(SHEET_TOP_CLEARANCE);
    expect(insideCardTopInset(routes, 'paywall', shown, 'ios')).toBeUndefined();
  });

  it('keeps the window top for a push over pages or a cover', () => {
    const routes = [{ key: 'tabs' }, { key: 'cover' }, { key: 'page' }];
    const cover = (route: { readonly key: string }) =>
      route.key === 'cover' ? ('fullScreenModal' as const) : undefined;
    expect(insideCardTopInset(routes, 'page', cover, 'ios')).toBeUndefined();
    // Android rises a page sheet as a page: what's pushed after it keeps the window's top.
    const modal = (route: { readonly key: string }) =>
      route.key === 'cover' ? ('modal' as const) : undefined;
    expect(insideCardTopInset(routes, 'page', modal, 'android')).toBeUndefined();
  });

  it('starts an iOS form sheet with an empty view, ahead of the screen', async () => {
    // Its first-subview walk would otherwise reach a scroll view nested in the content and move it.
    expect(await startsWithStop('formSheet', false)).toBe(true);
    expect(await startsWithStop('card', false)).toBe(false);
    expect(await startsWithStop('modal', false)).toBe(false);
    expect(await startsWithStop('formSheet', true)).toBe(false);
  });
});
