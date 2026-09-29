// Skia's native renderer does not exist under Jest; see ui/avatar/test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/avatar/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
  Redirect: () => null,
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { mrzLines } from '@cp/domain';

import { clearDraftForTests, readDraft, updateDraft } from '../flow-controller/draft-store';
import { NameScreen } from '../name/NameScreen';
import { nameReaction } from '../name/name-reaction';
import { PhotoScreen } from '../photo/PhotoScreen';
import { RealPhotoSheet } from '../photo/RealPhotoSheet';
import { SplashScreen } from '../splash/SplashScreen';
import { fakeServices, recordingAnalytics, renderOnboarding } from '../test-support/harness';
import { BLOCKED_NAME_WORDS } from '../content';
import type { PhotoServices } from '../photo/photo-pipeline';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

beforeEach(() => {
  clearDraftForTests();
  jest.mocked(router.push).mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('3a-1 splash', () => {
  it('offers the pass, an invite code and the returning sign-in', async () => {
    const analytics = recordingAnalytics();
    await renderOnboarding(<SplashScreen />, { analytics });
    expect(screen.getByTestId('onboarding-open')).toBeTruthy();
    await activate(screen.getByTestId('onboarding-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/phone?mode=returning');
    await activate(screen.getByTestId('onboarding-invite-code'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/invite/code');
    expect(analytics.events).toContainEqual({
      event: 'onboarding_step',
      props: { step: 'splash', path: 'new' },
    });
  });

  it('swings the cover open, grows the page into page one; reduced motion skips both', async () => {
    const rotation = () =>
      JSON.stringify(screen.getAllByTestId('onboarding-cover').at(-1)!.props.style);
    const page = (): ViewStyle =>
      StyleSheet.flatten(
        screen.getAllByTestId('onboarding-first-page').at(-1)!.props.style as StyleProp<ViewStyle>,
      ) ?? {};
    await renderOnboarding(<SplashScreen />);
    // A 390 pt wide body; the passport stage above the footer. Laying it out again after the tap
    // re-renders, so the animated styles read the finished animation.
    const layOut = (width: number) =>
      fireEvent(screen.getByTestId('onboarding-stage'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 520 } },
      });
    await layOut(390);
    await activate(screen.getByTestId('onboarding-open'));
    await layOut(391);
    await layOut(390);
    expect(rotation()).toContain('rotateY');
    expect(rotation()).toContain('-90deg');
    // Page one's card: 20 pt margins, 36 pt down the body, in the render's proportions.
    expect(page().width).toBeCloseTo(350);
    expect(page().height).toBeCloseTo(248);
    expect(page().top).toBeCloseTo(36 - (520 - 320) / 2);
    expect(page().left).toBeCloseTo(20 - (390 - 240) / 2);
    expect(router.push).toHaveBeenCalledWith('/onboarding/name');

    jest.mocked(router.push).mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderOnboarding(<SplashScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    await activate(screen.getAllByTestId('onboarding-open').at(-1)!);
    expect(rotation()).not.toContain('-90deg');
    expect(router.push).toHaveBeenCalledWith('/onboarding/name');
    expect(readDraft()?.step).toBe('name');
  });
});

describe('3a-2 name', () => {
  it('prints each letter on the pass and rewrites the MRZ', async () => {
    await renderOnboarding(<NameScreen />);
    expect(screen.getByRole('button', { name: 'Next' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'Winst');
    expect(screen.getByLabelText('Winst')).toBeTruthy();
    const [line1] = mrzLines({
      givenName: 'Winst',
      number: null,
      homeIso3: null,
      styleTags: [],
      stampCount: 0,
    });
    expect(screen.getByText(line1, { includeHiddenElements: true })).toBeTruthy();
    expect(readDraft()?.given_name).toBe('Winst');
  });

  it('lets Tokek react after a pause, from the scripted pool', async () => {
    jest.useFakeTimers();
    await renderOnboarding(<NameScreen />);
    expect(screen.getByText(/I’m Tokek, so I can’t judge/u)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'Winston');
    await act(async () => {
      jest.advanceTimersByTime(900);
      await Promise.resolve();
    });
    expect(screen.getByTestId('onboarding-name-tokek').props.accessibilityLabel).toMatch(
      /Winston/u,
    );
  });

  it('blocks names the guides can’t print, clips at 24 and reads other scripts', async () => {
    expect(nameReaction('', BLOCKED_NAME_WORDS)).toBe('empty');
    expect(nameReaction('Fuck', BLOCKED_NAME_WORDS)).toBe('blocked');
    expect(nameReaction('美咲', BLOCKED_NAME_WORDS)).toBe('script');
    expect(nameReaction('a'.repeat(24), BLOCKED_NAME_WORDS)).toBe('long');
    await renderOnboarding(<NameScreen />);
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'x'.repeat(30));
    expect(readDraft()?.given_name).toHaveLength(24);
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'fuck');
    expect(screen.getByRole('button', { name: 'Next' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('moves to the photo page', async () => {
    await renderOnboarding(<NameScreen />);
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'Winston');
    await activate(screen.getByTestId('onboarding-name-next'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/photo');
    expect(readDraft()?.step).toBe('photo');
  });
});

describe('3a-3 photo', () => {
  beforeEach(() => {
    updateDraft((d) => ({ ...d, given_name: 'Winston', step: 'photo' }));
  });

  it('drops the picked guide into the frame and moves on', async () => {
    await renderOnboarding(<PhotoScreen />);
    await activate(screen.getByTestId('onboarding-photo-guides-pon'));
    expect(readDraft()?.avatar).toEqual({ kind: 'critter', form_id: 'guide:pon' });
    await activate(screen.getByTestId('onboarding-photo-next'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/taste');
  });

  it('defaults to Tokek when nothing was picked', async () => {
    await renderOnboarding(<PhotoScreen />);
    await activate(screen.getByTestId('onboarding-photo-next'));
    expect(readDraft()?.avatar).toEqual({ kind: 'critter', form_id: 'guide:tokek' });
  });

  it('offers a real photo only where the picker exists', async () => {
    await renderOnboarding(<PhotoScreen />);
    expect(screen.queryByTestId('onboarding-photo-real')).toBeNull();
    const photos: PhotoServices = {
      picker: {
        pickFromLibrary: () => Promise.resolve(null),
        takePhoto: () => Promise.resolve({ kind: 'cancelled' }),
      },
      lift: null,
      prepare: () => Promise.reject(new Error('unused')),
      upload: () => Promise.resolve({ kind: 'offline' }),
    };
    await renderOnboarding(<PhotoScreen />, { services: fakeServices({ photos }) });
    await activate(screen.getByTestId('onboarding-photo-real'));
    expect(screen.getByTestId('real-photo-library')).toBeTruthy();
  });

  it.each([
    [{ kind: 'lifting' } as const, 'real-photo-lifting'],
    [
      { kind: 'preview', uri: 'file:///a.png', lifted: false, zoom: 1 } as const,
      'real-photo-no-subject',
    ],
    [
      { kind: 'uploading', progress: 0.4, preview: 'file:///a.png' } as const,
      'real-photo-uploading',
    ],
    [
      { kind: 'done', mediaKey: 'k', uri: 'file:///a.png', cutout: true } as const,
      'real-photo-done',
    ],
    [{ kind: 'camera_denied' } as const, 'real-photo-camera-denied'],
    [{ kind: 'rate_limited', retryAfterS: 900 } as const, 'real-photo-rate-limited'],
    [{ kind: 'failed', offline: true } as const, 'real-photo-failed'],
  ])('renders the %o state', async (state, id) => {
    const noop = () => undefined;
    await renderOnboarding(
      <RealPhotoSheet
        state={state}
        onLibrary={noop}
        onCamera={noop}
        onZoom={noop}
        onConfirm={noop}
        onRetry={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByTestId(id)).toBeTruthy();
  });
});
