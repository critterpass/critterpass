/**
 * A destination's editorial media through the travel-data path: the api's answer (recorded on
 * staging), then the last good copy once offline, and the photo each hero slot takes.
 */
import { describe, expect, it } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { TravelDataReaderProvider, type TravelDataReader } from '../../travel-data/client';
import { recordedReader } from '../../travel-data/test-support/recorded-reader';
import { heroAt, mediaPath, useDestinationMedia } from '../use-subject-media';

function withReader(reader: TravelDataReader) {
  return ({ children }: { children: ReactNode }) => (
    <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
  );
}

describe('useDestinationMedia', () => {
  it('reads the api, then keeps the last good copy offline', async () => {
    const reader = recordedReader({ '/v1/media': [200, 'media-da-nang'] });
    const first = await renderHook(() => useDestinationMedia('da-nang'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(first.result.current.items.length).toBe(7));
    expect(reader.paths).toEqual([mediaPath('destination:da-nang')]);
    expect(first.result.current.items[0]?.rank).toBe(0);
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useDestinationMedia('da-nang'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(second.result.current.items.length).toBe(7));
  });

  it('reads nothing without a destination', async () => {
    const reader = recordedReader({});
    const view = await renderHook(() => useDestinationMedia(null), { wrapper: withReader(reader) });
    expect(view.result.current.items).toEqual([]);
    expect(reader.paths).toEqual([]);
  });
});

describe('heroAt', () => {
  it('takes the hero first and wraps for later days', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never[];
    expect(heroAt(items)).toBe(items[0]);
    expect(heroAt(items, 4)).toBe(items[1]);
    expect(heroAt([], 2)).toBeNull();
  });
});
