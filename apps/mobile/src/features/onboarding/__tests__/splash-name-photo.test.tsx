// Skia's native renderer does not exist under Jest; see lib/test-support/cutout-skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/lib/test-support/cutout-skia-double'));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';

import { mrzLines } from '@cp/domain';

import { clearDraftForTests, readDraft, updateDraft } from '../flow-controller/draft-store';
import { PremiumNamePage } from '../premium/name/PremiumNamePage';
import { nameReaction } from '../name/name-reaction';
import { PremiumPhotoPage } from '../premium/photo/PremiumPhotoPage';
import { PremiumSplashPage } from '../premium/splash/PremiumSplashPage';
import { fakeServices, recordingAnalytics, renderOnboarding } from '../test-support/harness';
import { BLOCKED_NAME_WORDS } from '../content';
import type { PhotoServices } from '../photo/photo-pipeline';

const activate = (element: Parameters<typeof fireEvent.press>[0]) => fireEvent.press(element);

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
    await renderOnboarding(<PremiumSplashPage />, { analytics });
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

  it('opens into page one once, with or without motion', async () => {
    await renderOnboarding(<PremiumSplashPage />);
    await activate(screen.getByTestId('onboarding-open'));
    // A second tap mid-opening does not push page one twice.
    await activate(screen.getByTestId('onboarding-open'));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/onboarding/name');

    jest.mocked(router.push).mockClear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderOnboarding(<PremiumSplashPage />);
    await act(async () => {
      await Promise.resolve();
    });
    await activate(screen.getAllByTestId('onboarding-open').at(-1)!);
    expect(router.push).toHaveBeenCalledWith('/onboarding/name');
    expect(readDraft()?.step).toBe('name');
  });
});

describe('3a-2 name', () => {
  it('prints each letter on the pass and rewrites the MRZ', async () => {
    await renderOnboarding(<PremiumNamePage />);
    expect(screen.getByRole('button', { name: 'Next' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'Winst');
    expect(screen.getByTestId('onboarding-name-glyphs')).toHaveTextContent(/Winst/u);
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
    await renderOnboarding(<PremiumNamePage />);
    expect(screen.getByText(/I’m Tokek, so I can’t judge/u)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'Winston');
    await act(async () => {
      jest.advanceTimersByTime(900);
      await Promise.resolve();
    });
    expect(screen.getByTestId('onboarding-name-tokek')).toHaveTextContent(/Winston/u);
  });

  it('blocks names the guides can’t print, clips at 24 and reads other scripts', async () => {
    expect(nameReaction('', BLOCKED_NAME_WORDS)).toBe('empty');
    expect(nameReaction('Fuck', BLOCKED_NAME_WORDS)).toBe('blocked');
    expect(nameReaction('美咲', BLOCKED_NAME_WORDS)).toBe('script');
    expect(nameReaction('a'.repeat(24), BLOCKED_NAME_WORDS)).toBe('long');
    await renderOnboarding(<PremiumNamePage />);
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'x'.repeat(30));
    expect(readDraft()?.given_name).toHaveLength(24);
    await fireEvent.changeText(screen.getByTestId('onboarding-name-field'), 'fuck');
    expect(screen.getByRole('button', { name: 'Next' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('moves to the photo page', async () => {
    await renderOnboarding(<PremiumNamePage />);
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
    await renderOnboarding(<PremiumPhotoPage />);
    await activate(screen.getByTestId('avatar-pon'));
    expect(readDraft()?.avatar).toEqual({ kind: 'critter', form_id: 'guide:pon' });
    await activate(screen.getByTestId('onboarding-photo-next'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/taste');
  });

  it('defaults to Tokek when nothing was picked', async () => {
    await renderOnboarding(<PremiumPhotoPage />);
    await activate(screen.getByTestId('onboarding-photo-next'));
    expect(readDraft()?.avatar).toEqual({ kind: 'critter', form_id: 'guide:tokek' });
  });

  it('offers a real photo only where the picker exists', async () => {
    await renderOnboarding(<PremiumPhotoPage />);
    expect(screen.queryByTestId('onboarding-photo-real')).toBeNull();
    const pickFromLibrary = jest.fn(() => Promise.resolve(null));
    const photos: PhotoServices = {
      picker: {
        pickFromLibrary,
        takePhoto: () => Promise.resolve({ kind: 'cancelled' }),
      },
      lift: null,
      prepare: () => Promise.reject(new Error('unused')),
      upload: () => Promise.resolve({ kind: 'offline' }),
    };
    await renderOnboarding(<PremiumPhotoPage />, { services: fakeServices({ photos }) });
    await activate(screen.getByTestId('onboarding-photo-real'));
    // Only the photo picked is ever read: the library opens on the tap.
    await waitFor(() => expect(pickFromLibrary).toHaveBeenCalledTimes(1));
  });
});
