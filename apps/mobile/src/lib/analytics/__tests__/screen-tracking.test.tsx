jest.unmock('expo-router');

import { describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import { Text } from 'react-native';

import { routeNameFromSegments, useScreenTracking } from '../screen-tracking';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { renderRouter } from 'expo-router/testing-library';

describe('screen tracking', () => {
  it('names routes by pattern, without groups or params', () => {
    expect(routeNameFromSegments(['(app)', 'trip', '[tripId]'])).toBe('trip/[tripId]');
    expect(routeNameFromSegments(['(tabs)'])).toBe('index');
  });

  it('emits the route pattern on every route change, never the params', async () => {
    const screen = jest.fn();
    function Root() {
      useScreenTracking({ screen });
      return <Stack screenOptions={{ headerShown: false }} />;
    }
    await renderRouter(
      {
        _layout: Root,
        index: () => <Text>home</Text>,
        '(app)/trip/[tripId]': () => <Text>trip</Text>,
      },
      { initialUrl: '/' },
    );
    await act(() => {
      router.push('/trip/0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b?code=ABC123');
    });
    expect(screen.mock.calls.map(([name]) => name)).toEqual(['index', 'trip/[tripId]']);
  });
});
