// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('../../sticker/Sticker', () => require('../test-support/sticker-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderUi } from '../../test-support/render';
import { UserAvatar, visibleAvatar, type AvatarView } from '../Avatar';
import { AvatarPicker } from '../AvatarPicker';
import { GUIDE_AVATAR_IDS, GUIDE_STICKERS, isGuideStickerId } from '../guides';
import { PhotoAvatar } from '../PhotoAvatar';

const pending: AvatarView = {
  kind: 'photo',
  uri: 'file:///me.png',
  cutout: true,
  review: 'pending',
};

describe('visibleAvatar', () => {
  it('shows a pending photo to its owner only, and a rejected one to nobody', () => {
    expect(visibleAvatar(pending, 'self')).toBe(pending);
    expect(visibleAvatar(pending, 'others')).toEqual({ kind: 'initials' });
    const rejected: AvatarView = { ...pending, review: 'rejected' };
    expect(visibleAvatar(rejected, 'self')).toEqual({ kind: 'initials' });
    const approved: AvatarView = { ...pending, review: 'approved' };
    expect(visibleAvatar(approved, 'others')).toBe(approved);
  });
});

describe('UserAvatar', () => {
  it('falls back to initials for crewmates while the photo is pending', async () => {
    await renderUi(<UserAvatar name="Winston" avatar={pending} viewer="others" testID="av" />);
    expect(screen.getByTestId('av-initials')).toBeTruthy();
    expect(screen.getByText('W')).toBeTruthy();
    expect(screen.queryByTestId('av-photo')).toBeNull();
  });
});

describe('AvatarPicker', () => {
  it('lists the six live guides and reports a pick', async () => {
    const onPick = jest.fn();
    await renderUi(<AvatarPicker selected="tokek" onPick={onPick} testID="pick" />);
    expect(GUIDE_AVATAR_IDS).toHaveLength(6);
    expect(
      screen.getByRole('radio', { name: GUIDE_STICKERS.tokek.name }).props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    await fireEvent(screen.getByTestId('pick-ajo'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(onPick).toHaveBeenCalledWith('ajo');
  });
});

describe('guide stickers', () => {
  it('draws every guide from its dex entry, Chà Vá of Đà Nẵng included', () => {
    expect(GUIDE_STICKERS.tokek).toEqual({ id: 'tokek', name: 'Tokek', kind: 'gecko' });
    expect(GUIDE_STICKERS.chava).toEqual({ id: 'chava', name: 'Chà Vá', kind: 'langur' });
    expect(isGuideStickerId('chava')).toBe(true);
    expect(isGuideStickerId('toString')).toBe(false);
    expect(isGuideStickerId(null)).toBe(false);
  });

  it('keeps Chà Vá out of the six-guide avatar picker', async () => {
    await renderUi(<AvatarPicker selected={null} onPick={jest.fn()} testID="pick" />);
    expect(GUIDE_AVATAR_IDS).not.toContain('chava');
    expect(screen.queryByTestId('pick-chava')).toBeNull();
  });
});

describe('PhotoAvatar', () => {
  it('shows a photo without a subject as a plain circle crop', async () => {
    await renderUi(<PhotoAvatar uri="file:///photo.png" size={120} cutout={false} testID="p" />);
    expect(screen.queryByTestId('skia-image')).toBeNull();
    expect(screen.queryByTestId('skia-morphology')).toBeNull();
  });
});
