import { afterEach, describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  forgetAppearanceForTests,
  readAppearance,
  resolveScheme,
  setAppearance,
  useAppearance,
} from '../theme/appearance';

describe('resolveScheme', () => {
  it('follows the phone when the setting is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('draws light when the phone reports no scheme', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('lets a pinned setting win over the phone', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});

describe('appearance setting', () => {
  afterEach(() => {
    setAppearance('system');
    forgetAppearanceForTests();
  });

  it('follows the phone until set', () => {
    forgetAppearanceForTests();
    expect(readAppearance()).toBe('system');
  });

  it('keeps the choice across launches', () => {
    setAppearance('dark');
    forgetAppearanceForTests();
    expect(readAppearance()).toBe('dark');
  });

  it('re-renders readers when the setting changes', async () => {
    const { result } = await renderHook(() => useAppearance());
    expect(result.current[0]).toBe('system');
    await act(() => {
      result.current[1]('light');
    });
    expect(result.current[0]).toBe('light');
  });
});
