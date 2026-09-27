import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

function i18nWrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

interface NetworkStateStub {
  readonly isConnected: boolean;
  readonly isInternetReachable: boolean;
}

const mockUseNetworkState = jest.fn<() => NetworkStateStub>();
jest.mock('expo-network', () => ({ useNetworkState: () => mockUseNetworkState() }));

const mockSearchPlacesOffline = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
jest.mock('../offlineSearch', () => ({
  getOfflineDb: () => Promise.resolve({}),
  searchPlacesOffline: (...args: unknown[]) => mockSearchPlacesOffline(...args),
}));

import { usePlaceSearch } from '../usePlaceSearch';

const ONLINE: NetworkStateStub = { isConnected: true, isInternetReachable: true };
const OFFLINE: NetworkStateStub = { isConnected: false, isInternetReachable: false };

let fetchMock: jest.Mock<(...args: unknown[]) => Promise<unknown>>;

beforeEach(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  global.fetch = fetchMock as never;
  mockUseNetworkState.mockReturnValue(ONLINE);
  mockSearchPlacesOffline.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePlaceSearch', () => {
  it('fetches from the real API and maps categories to icon keys/labels when online', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 'nishiki',
              name: 'Nishiki Market',
              category: 'market',
              lat: 35.005,
              lng: 135.765,
            },
          ],
        }),
    });

    const { result } = await renderHook(
      () => usePlaceSearch({ q: 'nishiki', destinationId: 'kyoto-id' }),
      { wrapper: i18nWrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('online');
    expect(result.current.places).toEqual([
      {
        id: 'nishiki',
        name: 'Nishiki Market',
        iconKey: 'pin-market',
        categoryLabel: 'Market',
        lat: 35.005,
        lng: 135.765,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/places/search?'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('surfaces the api error envelope rather than a fake empty result', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({ error: { code: 'AUTH_REQUIRED', message: 'Sign in required' } }),
    });

    const { result } = await renderHook(() => usePlaceSearch({ destinationId: 'kyoto-id' }), {
      wrapper: i18nWrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Sign in required');
    expect(result.current.places).toEqual([]);
    expect(result.current.source).toBe('none');
  });

  it('falls back to the offline SQLite index when there is no network', async () => {
    mockUseNetworkState.mockReturnValue(OFFLINE);
    mockSearchPlacesOffline.mockResolvedValue([
      {
        id: 'fushimi',
        destinationId: 'kyoto-id',
        name: 'Fushimi Inari',
        iconKey: 'pin-temple-shrine',
        categoryLabel: 'Temple or shrine',
        lat: 34.967,
        lng: 135.773,
      },
    ]);

    const { result } = await renderHook(
      () => usePlaceSearch({ q: 'fushimi', destinationId: 'kyoto-id' }),
      { wrapper: i18nWrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('offline');
    expect(result.current.places).toEqual([
      {
        id: 'fushimi',
        name: 'Fushimi Inari',
        iconKey: 'pin-temple-shrine',
        categoryLabel: 'Temple or shrine',
        lat: 34.967,
        lng: 135.773,
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forceOffline reaches the offline path even while the device reports it is online (E2E testability seam)', async () => {
    mockUseNetworkState.mockReturnValue(ONLINE);
    mockSearchPlacesOffline.mockResolvedValue([
      {
        id: 'nishiki',
        destinationId: 'kyoto-id',
        name: 'Nishiki Market',
        iconKey: 'pin-market',
        categoryLabel: 'Market',
        lat: 35.005,
        lng: 135.765,
      },
    ]);

    const { result } = await renderHook(
      () => usePlaceSearch({ q: 'nishiki', destinationId: 'kyoto-id', forceOffline: true }),
      { wrapper: i18nWrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.source).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no results offline without a destination to scope the local index to', async () => {
    mockUseNetworkState.mockReturnValue(OFFLINE);

    const { result } = await renderHook(() => usePlaceSearch({ q: 'anything' }), {
      wrapper: i18nWrapper,
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.places).toEqual([]);
    expect(result.current.source).toBe('none');
    expect(mockSearchPlacesOffline).not.toHaveBeenCalled();
  });
});
