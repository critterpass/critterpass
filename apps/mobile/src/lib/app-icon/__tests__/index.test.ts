import { describe, expect, it } from '@jest/globals';

import { APP_ICON_BASE_IDS } from '@cp/domain';

import { bundledAppIconKeys, iconKeyFromNativeName, nativeIconName } from '../index';

describe('app icon names', () => {
  it('is the catalogue the icon plugin bundles', () => {
    // modules/cp-app-icon/plugin/with-app-icons.ts APP_ICON_IDS pins the same list.
    expect([...APP_ICON_BASE_IDS]).toEqual([
      'face',
      'passport',
      'stamp',
      'sticker',
      'temple',
      'sardi',
      'home-set',
      'pon',
      'golden',
      'bali-six',
    ]);
  });

  it('maps the automatic passport to the primary icon and the rest to hyphenated names', () => {
    expect(nativeIconName('passport', 'auto')).toBeNull();
    expect(nativeIconName('passport', 'dark')).toBe('passport-dark');
    expect(nativeIconName('home-set', 'auto')).toBe('home-set');
    expect(nativeIconName('home-set', 'tinted')).toBe('home-set-tinted');
  });

  it('reads native names back as catalogue keys, hyphenated ids included', () => {
    expect(iconKeyFromNativeName(null)).toBe('passport');
    expect(iconKeyFromNativeName('face')).toBe('face');
    expect(iconKeyFromNativeName('bali-six')).toBe('bali-six');
    expect(iconKeyFromNativeName('bali-six-dark')).toBe('bali-six.dark');
    expect(iconKeyFromNativeName('stamp-light')).toBe('stamp.light');
    expect(iconKeyFromNativeName('AppIcon')).toBeNull();
    expect(iconKeyFromNativeName('face-sepia')).toBeNull();
  });

  it('lists the primary icon plus every bundled alternate it understands', () => {
    expect([...bundledAppIconKeys(['face', 'passport-dark', 'unknown'])].sort()).toEqual([
      'face',
      'passport',
      'passport.dark',
    ]);
  });
});
