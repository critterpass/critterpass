/**
 * An avatar draws the face its member chose: a photo (the initial shows while it loads and stays if
 * it fails), a critter, or the initial when nothing was chosen; an erased account never shows one.
 */
import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { renderWithI18n } from '@/lib/i18n/testing';
import { Avatar, avatarFill, PremiumThemeProvider } from '@/ui/premium';
import { initialSize } from '@/ui/premium/people/Avatar';
import { MemberFaceProvider, type MemberFaceResolver } from '@/ui/premium/people/member-face';

const PHOTO = { uri: 'https://media.example/face.jpg' };

const resolve: MemberFaceResolver = (uid) => {
  if (uid === 'photo-uid') return { photo: { uri: PHOTO.uri } };
  if (uid === 'critter-uid') return { critter: <Text>critter-face</Text> };
  return {};
};

async function renderAvatar(uid: string | undefined, withFaces = true) {
  const avatar = <Avatar name="Linh" color={tokens.guide.pon} uid={uid} testID="face" />;
  await renderWithI18n(
    <PremiumThemeProvider>
      {withFaces ? <MemberFaceProvider resolve={resolve}>{avatar}</MemberFaceProvider> : avatar}
    </PremiumThemeProvider>,
  );
}

describe('avatarFill', () => {
  it('prefers a photo, then a critter, then the initial', () => {
    expect(avatarFill('Linh', { photo: PHOTO, critter: 'c' }, false)).toBe('photo');
    expect(avatarFill('Linh', { photo: PHOTO, critter: 'c' }, true)).toBe('critter');
    expect(avatarFill('Linh', { photo: PHOTO }, true)).toBe('initial');
    expect(avatarFill('Linh', { critter: 'c' }, false)).toBe('critter');
    expect(avatarFill('Linh', {}, false)).toBe('initial');
  });

  it('never shows a face for an erased account', () => {
    expect(avatarFill('', { photo: PHOTO, critter: 'c' }, false)).toBe('former');
  });
});

describe('Avatar', () => {
  it('draws the chosen photo, keeping the initial until it loads', async () => {
    await renderAvatar('photo-uid');
    const photo = screen.getByTestId('face-photo');
    expect(screen.getByText('L')).toBeTruthy();
    await fireEvent(photo, 'load');
    expect(screen.queryByText('L')).toBeNull();
  });

  it('falls back to the initial when the photo fails', async () => {
    await renderAvatar('photo-uid');
    await fireEvent(screen.getByTestId('face-photo'), 'error');
    expect(screen.queryByTestId('face-photo')).toBeNull();
    expect(screen.getByText('L')).toBeTruthy();
  });

  it('draws the chosen critter', async () => {
    await renderAvatar('critter-uid');
    expect(screen.getByText('critter-face')).toBeTruthy();
    expect(screen.queryByText('L')).toBeNull();
  });

  it('keeps the initial without a choice, a uid or a provider', async () => {
    await renderAvatar('nobody');
    expect(screen.getByText('L')).toBeTruthy();
    await screen.unmount();
    await renderAvatar(undefined);
    expect(screen.getByText('L')).toBeTruthy();
    await screen.unmount();
    await renderAvatar('photo-uid', false);
    expect(screen.queryByTestId('face-photo')).toBeNull();
  });
});

describe('the initial in a large circle', () => {
  it('keeps the token size up to the large avatar, then grows with the circle', () => {
    expect(initialSize(40, 40, 14)).toBeUndefined();
    expect(initialSize(76, 40, 14)).toBe(40);
    const mid = initialSize(56, 40, 14) ?? 0;
    expect(mid).toBeGreaterThan(14);
    expect(mid).toBeLessThan(40);
  });
});
