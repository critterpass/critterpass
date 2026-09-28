// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('../../sticker/Sticker', () => require('../test-support/sticker-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderUi } from '../../test-support/render';
import { UserAvatar, visibleAvatar, type AvatarView } from '../Avatar';
import { AvatarPicker } from '../AvatarPicker';
import { GUIDE_AVATAR_IDS, GUIDE_STICKERS } from '../guides';

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
  it('renders the pending photo with its review badge for the owner', async () => {
    await renderUi(
      <UserAvatar
        name="Winston"
        avatar={pending}
        viewer="self"
        reviewLabel="Under review"
        testID="av"
      />,
    );
    expect(screen.getByTestId('av-photo')).toBeTruthy();
    expect(screen.getByText('UNDER REVIEW')).toBeTruthy();
  });

  it('falls back to initials for crewmates while the photo is pending', async () => {
    await renderUi(<UserAvatar name="Winston" avatar={pending} viewer="others" testID="av" />);
    expect(screen.getByTestId('av-initials')).toBeTruthy();
    expect(screen.getByText('W')).toBeTruthy();
    expect(screen.queryByTestId('av-photo')).toBeNull();
  });

  it('keeps the rejected state visible to the owner as initials plus the badge', async () => {
    await renderUi(
      <UserAvatar
        name="Winston"
        avatar={{ ...pending, review: 'rejected' }}
        viewer="self"
        reviewLabel="Not approved"
        testID="av"
      />,
    );
    expect(screen.getByTestId('av-initials')).toBeTruthy();
    expect(screen.getByText('NOT APPROVED')).toBeTruthy();
  });

  it('draws guide and ringed critter stickers', async () => {
    await renderUi(
      <UserAvatar
        name="Winston"
        avatar={{ kind: 'guide', guide: 'pon' }}
        viewer="others"
        testID="g"
      />,
    );
    expect(screen.getByTestId('g-guide')).toBeTruthy();
    expect(screen.getByLabelText('Pon')).toBeTruthy();
    await renderUi(
      <UserAvatar
        name="Winston"
        avatar={{
          kind: 'critter',
          critterKind: 'gecko',
          critterName: 'Temple Tokek',
          tier: 'rare',
        }}
        viewer="others"
        testID="c"
      />,
    );
    expect(screen.getByLabelText('Temple Tokek, Rare')).toBeTruthy();
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

  it('maps every guide to its dex sticker', () => {
    expect(GUIDE_STICKERS.tokek.kind).toBe('gecko');
    expect(GUIDE_STICKERS.lundi.kind).toBe('puffin');
    expect(GUIDE_STICKERS.paco.kind).toBe('alpaca');
  });
});
