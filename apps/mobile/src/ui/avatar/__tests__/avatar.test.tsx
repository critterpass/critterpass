// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('../../sticker/Sticker', () => require('../test-support/sticker-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { guideAccentOnPaper } from '@cp/critter-art/guides';
import { tokens } from '@cp/design-tokens';

import { applyGuideRows } from '@/lib/navigation/active-guide';

import { renderUi } from '../../test-support/render';
import { UserAvatar, visibleAvatar, type AvatarView } from '../Avatar';
import { AvatarPicker } from '../AvatarPicker';
import { GUIDE_AVATAR_IDS, guideIdOr, guideSticker, isGuideStickerId } from '../guides';
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
      screen.getByRole('radio', { name: guideSticker('tokek').name }).props.accessibilityState,
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
  afterEach(() => applyGuideRows([]));

  it('draws each designed guide from its dex entry in its token colour', () => {
    const drawn = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'chava'].map((id) => {
      const { name, kind, seed, accent, onPaper } = guideSticker(id);
      return { id, name, kind, seed, accent, onPaper };
    });
    const palette: Record<string, unknown> = { ...tokens.guide };
    const onPaper: Record<string, string> = tokens.guide.onPaper;
    expect(drawn).toEqual(
      [
        ['tokek', 'Tokek', 'gecko'],
        ['pon', 'Pon', 'tanuki'],
        ['lundi', 'Lundi', 'puffin'],
        ['ajo', 'Ajo', 'axolotl'],
        ['sardi', 'Sardi', 'sardine'],
        ['paco', 'Paco', 'alpaca'],
        ['chava', 'Chà Vá', 'langur'],
      ].map(([id = '', name, kind]) => ({
        id,
        name,
        kind,
        seed: 7,
        accent: palette[id],
        onPaper: onPaper[id],
      })),
    );
  });

  it("draws a city's guide from the dex before its row has synced", () => {
    expect(guideSticker('ngua')).toEqual({
      id: 'ngua',
      name: 'Ngựa',
      kind: 'cp-006',
      seed: 6,
      accent: '#ff8fbf',
      onPaper: guideAccentOnPaper('#ff8fbf'),
    });
    expect(isGuideStickerId('ngua')).toBe(true);
    expect(guideIdOr('ngua')).toBe('ngua');
  });

  it("takes a guide's name, critter and accent from its synced row", () => {
    applyGuideRows([{ slug: 'ngua', name: 'Ngựa Hoa', critterKey: 'cp-008', accent: '#aabbcc' }]);
    expect(guideSticker('ngua')).toMatchObject({
      name: 'Ngựa Hoa',
      kind: 'cp-008',
      seed: 8,
      accent: '#aabbcc',
      onPaper: guideAccentOnPaper('#aabbcc'),
    });
  });

  it('draws a row whose critter this build has no art for as the default guide, under its own name', () => {
    applyGuideRows([
      { slug: 'newcomer', name: 'Newcomer', critterKey: 'cp-999', accent: '#aabbcc' },
    ]);
    expect(guideSticker('newcomer')).toMatchObject({
      id: 'newcomer',
      name: 'Newcomer',
      kind: 'gecko',
      accent: '#aabbcc',
    });
  });

  it('falls back to Tokek only for a slug that is neither a row nor a critter', () => {
    expect(guideSticker('nobody')).toEqual(guideSticker('tokek'));
    expect(guideSticker(null).id).toBe('tokek');
    expect(guideIdOr('nobody')).toBe('tokek');
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
