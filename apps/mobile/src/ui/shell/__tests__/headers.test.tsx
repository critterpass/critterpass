import { act, fireEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import type * as ReactNativeModule from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { fixturesFor } from '../../gallery/registry';
import { BackEyebrow } from '../BackEyebrow';
import { SurfaceToneProvider } from '../../surface/Scaffold';
import { HeaderPill } from '../HeaderPills';
import { HomeHeader } from '../HomeHeader';
import { LargeTitle } from '../LargeTitle';

import '../shell.fixtures';

// `<Sticker>` rasterises through Skia's JSI/GPU host, which Jest cannot run (its own suite covers
// the real pipeline against canvaskit-wasm); here it is a plain view.
jest.mock('../../sticker/Sticker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports
  const RN = require('react-native') as typeof ReactNativeModule;
  return { Sticker: ({ kind }: { kind: string }) => <RN.View testID={`sticker-${kind}`} /> };
});

describe('BackEyebrow', () => {
  it('names where it goes back to and presses through', async () => {
    const onPress = jest.fn();
    const screen = await renderWithI18n(<BackEyebrow label="Profile" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Back to Profile' });
    expect(screen.getByText('PROFILE')).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('BackEyebrow on colour', () => {
  it('inks the arrow and label in the on-accent colour on a colour surface', async () => {
    const screen = await renderWithI18n(
      <SurfaceToneProvider value="accent">
        <BackEyebrow label="Next trip · Final" onPress={() => {}} />
      </SurfaceToneProvider>,
    );
    const label = screen.getByText('NEXT TRIP · FINAL');
    expect(StyleSheet.flatten(label.props.style as StyleProp<TextStyle>)?.color).toBe(
      tokens.semantic.text.onAccent,
    );
  });
});

describe('HeaderPill', () => {
  it('always shows the status word, never colour alone', async () => {
    const screen = await renderWithI18n(<HeaderPill label="No signal" tone="offline" testID="p" />);
    expect(screen.getByText('NO SIGNAL')).toBeTruthy();
    expect(screen.getByTestId('p').props.accessibilityRole).toBe('text');
  });

  it('is a button only as an action pill', async () => {
    const onPress = jest.fn();
    const screen = await renderWithI18n(<HeaderPill label="Share" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('HomeHeader', () => {
  it('announces unread counts and routes each control', async () => {
    const handlers = {
      onOpenProfile: jest.fn(),
      onSwitchCrew: jest.fn(),
      onOpenChat: jest.fn(),
      onOpenInbox: jest.fn(),
    };
    const screen = await renderWithI18n(
      <HomeHeader
        name="Winston"
        crewName="The Bali Six"
        members={[{ initial: 'M', color: 'pink' }]}
        unreadChat={5}
        unreadInbox={3}
        {...handlers}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Crew chat, 5 new' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Inbox, 3 new' }));
    await fireEvent.press(screen.getByRole('button', { name: 'The Bali Six, switch crew' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Hey Winston' }));
    expect(handlers.onOpenChat).toHaveBeenCalled();
    expect(handlers.onOpenInbox).toHaveBeenCalled();
    expect(handlers.onSwitchCrew).toHaveBeenCalled();
    expect(handlers.onOpenProfile).toHaveBeenCalled();
    expect(screen.getByText('THE BALI SIX')).toBeTruthy();
  });

  it('drops the counts once everything is read', async () => {
    const screen = await renderWithI18n(
      <HomeHeader
        name="Winston"
        crewName="The Bali Six"
        members={[]}
        onOpenProfile={jest.fn()}
        onSwitchCrew={jest.fn()}
        onOpenChat={jest.fn()}
        onOpenInbox={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Inbox' })).toBeTruthy();
    expect(screen.queryByTestId('home-header-inbox-badge')).toBeNull();
  });
});

describe('HomeHeader layout', () => {
  it('keeps a long crew name on one line and shows three faces at most', async () => {
    const screen = await renderWithI18n(
      <HomeHeader
        name="Khanh"
        crewName="Bali demo crew for the long weekend"
        members={['K', 'M', 'J', 'A', 'R'].map((initial) => ({ initial, color: 'pink' }))}
        onOpenProfile={jest.fn()}
        onSwitchCrew={jest.fn()}
        onOpenChat={jest.fn()}
        onOpenInbox={jest.fn()}
      />,
    );
    expect(screen.getByTestId('home-header-crew-name').props.numberOfLines).toBe(1);
    const hidden = { includeHiddenElements: true };
    expect(screen.getByText('J', hidden)).toBeTruthy();
    expect(screen.queryByText('A', hidden)).toBeNull();
    expect(screen.getByText('›', hidden)).toBeTruthy();
  });
});

describe('LargeTitle', () => {
  it('shows a back button on a pushed screen, and none on a root screen', async () => {
    const back = jest.spyOn(router, 'back').mockImplementation(() => undefined);
    const canGoBack = jest.spyOn(router, 'canGoBack').mockReturnValue(true);
    const pushed = await renderWithI18n(<LargeTitle title="Inbox" />);
    await fireEvent.press(pushed.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledTimes(1);
    await act(() => pushed.unmount());

    canGoBack.mockReturnValue(false);
    const root = await renderWithI18n(<LargeTitle title="Inbox" />);
    expect(root.queryByRole('button', { name: 'Back' })).toBeNull();
    jest.restoreAllMocks();
  });

  it('truncates the compact title between the slots instead of running under them', async () => {
    const screen = await renderWithI18n(
      <LargeTitle title="Your crews and every trip you are planning" collapsed end={<></>} />,
    );
    const compact = screen.getAllByText('YOUR CREWS AND EVERY TRIP YOU ARE PLANNING', {
      includeHiddenElements: true,
    })[0];
    expect(compact?.props.numberOfLines).toBe(1);
  });

  it('exposes one header to screen readers for each collapse state', async () => {
    const expanded = await renderWithI18n(<LargeTitle title="Settings" />);
    expect(expanded.getAllByRole('header')).toHaveLength(1);
    await act(() => expanded.unmount());
    const collapsed = await renderWithI18n(<LargeTitle title="Settings" collapsed />);
    expect(collapsed.getAllByRole('header')).toHaveLength(1);
  });
});

describe('shell fixtures', () => {
  it('registers every header state for the gallery', () => {
    for (const component of ['BackEyebrow', 'LargeTitle', 'HeaderPills', 'HomeHeader']) {
      expect(fixturesFor(component).length).toBeGreaterThan(0);
    }
  });
});
