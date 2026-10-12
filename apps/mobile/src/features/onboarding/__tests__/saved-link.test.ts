import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { clearFirstTripLink, saveFirstTripLink, useSavedFirstTripLink } from '../saved-link';

describe('a pasted link kept for the first trip', () => {
  it('keeps web links only, and Home sees it until it is handed over', async () => {
    expect(saveFirstTripLink('KQ7M3P and some words', null)).toBeNull();
    const { result } = await renderHook(() => useSavedFirstTripLink());
    await act(() => {
      saveFirstTripLink(' https://www.tiktok.com/@a/video/1 ', 'tiktok');
    });
    expect(result.current).toEqual({ url: 'https://www.tiktok.com/@a/video/1', source: 'tiktok' });
    await act(() => {
      clearFirstTripLink();
    });
    expect(result.current).toBeNull();
  });
});
