import { existsSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';

import {
  SHEET_GROUPS,
  SHEET_ROUTES,
  sheetGroupOptions,
  sheetScreens,
  type SheetNavigator,
} from '../sheet-routes';
import { modalGroupOptions } from '../transitions';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter } from 'expo-router/testing-library';

const PUSH = { headerShown: false };

type Presented = 'page' | 'sheet';

/** How the root stack presents each group's card, as last decided. */
const presented = new Map<string, Presented>();

/** The app's root stack: pushes by default, and the groups that hold sheet routes decide per card. */
function Root() {
  return (
    <Stack screenOptions={PUSH}>
      {SHEET_GROUPS.map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={(props: Parameters<typeof sheetGroupOptions>[0]) => {
            const options = sheetGroupOptions(props);
            presented.set(name, options.presentation === 'transparentModal' ? 'sheet' : 'page');
            return options;
          }}
        />
      ))}
    </Stack>
  );
}

/** A group's layout as the app writes it: pushes, with its sheet screens modal. */
const group = (navigator: SheetNavigator) =>
  function GroupLayout() {
    return (
      <Stack screenOptions={PUSH}>
        {sheetScreens(navigator).map((name) => (
          <Stack.Screen key={name} name={name} options={modalGroupOptions()} />
        ))}
      </Stack>
    );
  };

const named = (name: string) =>
  function Screen() {
    return <Text>{name}</Text>;
  };

const ROUTES = {
  _layout: Root,
  index: named('home'),
  'crew/_layout': group('crew'),
  'crew/index': named('crews sheet'),
  'crew/[crewId]/settings': named('crew settings'),
  'vote/_layout': group('vote'),
  'vote/pitch': named('pitch sheet'),
  'vote/new-poll': named('new poll sheet'),
  'vote/[pollId]/index': named('showdown'),
  'places/_layout': group('places'),
  'places/search': named('search sheet'),
  'places/[placeId]': named('place page'),
  'explore/_layout': group('explore'),
  'explore/why-sponsored': named('why sponsored'),
  'explore/index': named('explore'),
  '(trip)/_layout': group('(trip)'),
  '(trip)/lock-screen-offer': named('lock screen offer'),
  '(trip)/[tripId]/_layout': group('(trip)/[tripId]'),
  '(trip)/[tripId]/add/[placeId]': named('add to plan'),
  '(trip)/[tripId]/search/link': named('paste a link'),
  '(trip)/[tripId]/check/gap': named('fill a gap'),
  '(trip)/[tripId]/drivers/pick': named('pick days'),
  '(trip)/[tripId]/plan/index': named('plan'),
};

async function renderApp() {
  const pending = renderRouter(ROUTES, { initialUrl: '/' });
  await pending;
  await act(async () => {});
  return { getPathname: () => pending.getPathname() };
}

async function go(action: () => void) {
  await act(() => {
    action();
  });
  await act(async () => {});
}

beforeEach(() => presented.clear());

describe('sheet routes outside (modal)', () => {
  it('names a route file for every sheet', () => {
    const app = path.join(__dirname, '../../../app');
    for (const route of SHEET_ROUTES) {
      expect([route, existsSync(path.join(app, `${route}.tsx`))]).toEqual([route, true]);
    }
  });

  it('opens a sheet from another navigator on a see-through card over its opener', async () => {
    const app = await renderApp();
    await go(() => router.push('/crew'));
    expect(app.getPathname()).toBe('/crew');
    expect(presented.get('crew')).toBe('sheet');

    await go(() => router.back());
    await go(() => router.push('/vote/pitch?crewId=c1'));
    expect(presented.get('vote')).toBe('sheet');

    await go(() => router.back());
    await go(() => router.push('/places/search'));
    expect(presented.get('places')).toBe('sheet');

    await go(() => router.back());
    await go(() => router.push('/lock-screen-offer'));
    expect(app.getPathname()).toBe('/lock-screen-offer');
    expect(presented.get('(trip)')).toBe('sheet');
  });

  it('pushes a page of the same groups as an ordinary card', async () => {
    const app = await renderApp();
    await go(() => router.push('/crew/c1/settings'));
    expect(app.getPathname()).toBe('/crew/c1/settings');
    expect(presented.get('crew')).toBe('page');

    await go(() => router.push('/vote/p1'));
    expect(presented.get('vote')).toBe('page');
    await go(() => router.push('/places/p1'));
    expect(presented.get('places')).toBe('page');
    await go(() => router.push('/t1/plan'));
    expect(presented.get('(trip)')).toBe('page');
  });

  it('turns the card into a pushed page while a page covers its sheet, and back', async () => {
    const app = await renderApp();
    await go(() => router.push('/crew'));
    await go(() => router.push('/crew/c1/settings'));
    expect(app.getPathname()).toBe('/crew/c1/settings');
    expect(presented.get('crew')).toBe('page');

    await go(() => router.back());
    expect(app.getPathname()).toBe('/crew');
    expect(presented.get('crew')).toBe('sheet');
  });
});
