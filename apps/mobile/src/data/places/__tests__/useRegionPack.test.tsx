import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

function i18nWrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}

const mockDownloadAsync = jest.fn<() => Promise<{ uri: string } | undefined>>();
const mockCreateDownloadResumable =
  jest.fn<(...args: unknown[]) => { downloadAsync: typeof mockDownloadAsync }>();
const mockMakeDirectoryAsync = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockDeleteAsync = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  createDownloadResumable: (...args: unknown[]) => mockCreateDownloadResumable(...args),
}));

const mockGetOfflineDb = jest.fn<() => Promise<Record<string, never>>>();
const mockIndexPlacesOffline = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockClearOfflinePlaces = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock('../offlineSearch', () => ({
  getOfflineDb: () => mockGetOfflineDb(),
  indexPlacesOffline: (...args: unknown[]) => mockIndexPlacesOffline(...args),
  clearOfflinePlaces: (...args: unknown[]) => mockClearOfflinePlaces(...args),
}));

// The Better Auth Expo client lives behind native secure storage; the hook only needs its cookie.
jest.mock('@/data/app-session/auth-client', () => ({
  sessionHeaders: () => Promise.resolve({ cookie: 'better-auth.session_token=signed-in' }),
}));

import { useRegionPack } from '../useRegionPack';

let fetchMock: jest.Mock<(...args: unknown[]) => Promise<unknown>>;

beforeEach(() => {
  jest.clearAllMocks();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  fetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  global.fetch = fetchMock as never;
  mockGetOfflineDb.mockResolvedValue({});
  mockIndexPlacesOffline.mockResolvedValue(undefined);
  mockClearOfflinePlaces.mockResolvedValue(undefined);
  mockMakeDirectoryAsync.mockResolvedValue(undefined);
  mockDeleteAsync.mockResolvedValue(undefined);
  mockDownloadAsync.mockResolvedValue({ uri: 'file:///docs/cp-regions/kyoto-v1.pmtiles' });
  mockCreateDownloadResumable.mockReturnValue({ downloadAsync: mockDownloadAsync });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useRegionPack', () => {
  it('downloads the manifest pmtiles file and indexes the POI subset for offline search', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            url: 'https://tiles.test/kyoto/tiles-v1.pmtiles',
            bytes: 25_245_351,
            version: 'v1',
            poiCount: 2,
          }),
      })
      .mockResolvedValueOnce({
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

    const { result } = await renderHook(() => useRegionPack('kyoto-id', 'kyoto'), {
      wrapper: i18nWrapper,
    });

    await act(async () => {
      await result.current.download();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('downloaded');
    });

    expect(result.current.bytes).toBe(25_245_351);
    expect(result.current.poiCount).toBe(2);
    expect(result.current.localPmtilesUri).toBe('file:///docs/cp-regions/kyoto-v1.pmtiles');
    const signedIn = expect.objectContaining({
      headers: expect.objectContaining({ cookie: 'better-auth.session_token=signed-in' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/v1/map/regions/kyoto-id'),
      signedIn,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/v1/places/search?'),
      signedIn,
    );
    expect(mockIndexPlacesOffline).toHaveBeenCalledWith({}, 'kyoto-id', [
      expect.objectContaining({
        id: 'nishiki',
        destinationId: 'kyoto-id',
        iconKey: 'pin-market',
        categoryLabel: 'Market',
      }),
    ]);
  });

  it('reports an error status when the manifest request fails, without touching disk', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ error: { code: 'NOT_FOUND', message: 'no map region for destination' } }),
    });

    const { result } = await renderHook(() => useRegionPack('cusco-id', 'cusco'), {
      wrapper: i18nWrapper,
    });

    await act(async () => {
      await result.current.download();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('no map region for destination');
    expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
  });

  it('removing a downloaded pack deletes the local file and clears the offline index', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            url: 'https://tiles.test/kyoto/tiles-v1.pmtiles',
            bytes: 1,
            version: 'v1',
            poiCount: 0,
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) });

    const { result } = await renderHook(() => useRegionPack('kyoto-id', 'kyoto'), {
      wrapper: i18nWrapper,
    });

    await act(async () => {
      await result.current.download();
    });
    await waitFor(() => expect(result.current.status).toBe('downloaded'));

    await act(async () => {
      await result.current.remove();
    });

    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///docs/cp-regions/kyoto-v1.pmtiles', {
      idempotent: true,
    });
    expect(mockClearOfflinePlaces).toHaveBeenCalledWith({}, 'kyoto-id');
    expect(result.current.status).toBe('idle');
    expect(result.current.localPmtilesUri).toBeNull();
  });
});
