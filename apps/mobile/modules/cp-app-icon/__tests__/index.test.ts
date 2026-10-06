jest.mock('../src/CpAppIconModule', () => ({
  nativeCpAppIconModule: {
    isSupported: jest.fn(),
    getCurrent: jest.fn(),
    bundledNames: jest.fn(),
    set: jest.fn(),
  },
}));

import { describe, expect, it, jest } from '@jest/globals';

import {
  bundledAppIcons,
  getCurrentAppIcon,
  iconKeyFromNativeName,
  nativeIconName,
  setAppIcon,
} from '../index';
import { nativeCpAppIconModule } from '../src/CpAppIconModule';

/** The OS icon switch is the boundary: it cannot run under Jest. */
const native = nativeCpAppIconModule as unknown as {
  readonly getCurrent: jest.Mock<() => Promise<string | null>>;
  readonly bundledNames: jest.Mock<() => string[]>;
  readonly set: jest.Mock<(name: string | null) => Promise<string | null>>;
};

describe('cp-app-icon names', () => {
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
});

describe('cp-app-icon switching', () => {
  it('reports the device icon as a catalogue key', async () => {
    native.getCurrent.mockResolvedValueOnce('golden');
    await expect(getCurrentAppIcon()).resolves.toBe('golden');
  });

  it('lists the primary icon plus every bundled alternate it understands', () => {
    native.bundledNames.mockReturnValueOnce(['face', 'passport-dark', 'unknown']);
    expect([...bundledAppIcons()].sort()).toEqual(['face', 'passport', 'passport.dark']);
  });

  it('sends the native name, null for the primary icon', async () => {
    native.set.mockResolvedValue(null);
    await setAppIcon('passport', 'auto');
    await setAppIcon('sticker', 'dark');
    expect(native.set.mock.calls).toEqual([[null], ['sticker-dark']]);
  });
});
