import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useRegisteredHubTiles } from '@/features/trip';
import { isScreenRegistered } from '@/lib/navigation/screen-registry';

jest.mock('@/data/powersync/db', () => ({}));

// Loading the critters runtime pulls in most of the app's modules: a wide budget for slow runners.
describe('crew quests registration', () => {
  it('joins the trip hub and the navigation registry when the critters runtime loads', async () => {
    const before = await renderHook(() => useRegisteredHubTiles());
    expect(before.result.current).toEqual([]);
    await before.unmount();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded for its side effect.
    require('@/features/critters/register');
    const tiles = (await renderHook(() => useRegisteredHubTiles())).result.current;
    expect(tiles.map((tile) => [tile.key, tile.order])).toEqual([['quests', 40]]);
    expect(isScreenRegistered('3l-7')).toBe(true);
  }, 180_000);
});
