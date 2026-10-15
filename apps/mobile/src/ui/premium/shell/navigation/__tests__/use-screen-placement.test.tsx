jest.unmock('expo-router');

import { describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';

import { useScreenPlacement } from '../use-screen-placement';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter, screen } from 'expo-router/testing-library';

function Placement() {
  return <Text testID="placement">{JSON.stringify(useScreenPlacement())}</Text>;
}

const stack = () => <Stack screenOptions={{ headerShown: false }} />;

const ROUTES = {
  _layout: stack,
  index: () => <Text>home</Text>,
  'crew/_layout': stack,
  'crew/[crewId]/invite': Placement,
  'crew/[crewId]/settings': Placement,
};

async function open(path: string) {
  await renderRouter(ROUTES, { initialUrl: '/' });
  await act(() => {
    jest.runOnlyPendingTimers();
  });
  await act(() => {
    router.push(path);
  });
  await act(async () => {});
  return JSON.parse(String(screen.getByTestId('placement').props.children)) as unknown;
}

describe('screen placement under the router', () => {
  it('reads the first screen of a group opened on a sheet route as that sheet', async () => {
    // The root presents the crew group the way its first screen is listed: a sheet that fits its
    // content. The render that opens it still sees the root's state without the group.
    expect(await open('/crew/abc/invite')).toEqual({
      kind: 'presented',
      presentation: { kind: 'sheet', detents: 'fit' },
      ownStack: false,
    });
  });

  it('reads the first screen of a group opened on a page as pushed', async () => {
    expect(await open('/crew/abc/settings')).toEqual({ kind: 'pushed', ownStack: false });
  });
});
