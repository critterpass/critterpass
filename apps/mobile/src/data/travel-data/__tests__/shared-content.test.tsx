/**
 * Shared content over the api: each read answers from the api, then from its last good copy once
 * offline; an empty answer is an answer (nothing reviewed yet), and offline with no copy is missing.
 */
import { describe, expect, it } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { TravelDataReaderProvider, type TravelDataReader } from '../client';
import {
  useCostIndices,
  useCrowdForecasts,
  useDestinationSeason,
  useIdeasBoard,
} from '../shared-content';
import { recordedReader } from '../test-support/recorded-reader';

function withReader(reader: TravelDataReader) {
  return ({ children }: { children: ReactNode }) => (
    <TravelDataReaderProvider value={reader}>{children}</TravelDataReaderProvider>
  );
}

const KYOTO = '0192f000-0000-7000-8000-00000000d001';
const SHRINE = '0192f000-0000-7000-8000-00000000a001';

describe('the ideas board', () => {
  it('reads the api, then its last good copy once offline', async () => {
    const reader = recordedReader({ '/v1/help/ideas': [200, 'ideas-board'] });
    const first = await renderHook(() => useIdeasBoard(), { wrapper: withReader(reader) });
    await waitFor(() => expect(first.result.current.status).toBe('ok'));
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useIdeasBoard(), { wrapper: withReader(reader) });
    await waitFor(() => expect(second.result.current.status).toBe('stale'));
    expect(second.result.current).toMatchObject({ source: 'cache', reason: 'offline' });
  });

  it('answers an empty board as ok', async () => {
    const reader = recordedReader({ '/v1/help/ideas': [200, 'ideas-board-empty'] });
    const { result } = await renderHook(() => useIdeasBoard(), { wrapper: withReader(reader) });
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ok', data: { ideas: [] } }),
    );
  });
});

describe('season months and events', () => {
  it('reads the api, then its last good copy once offline', async () => {
    const reader = recordedReader({ '/v1/destinations/': [200, 'season-kyoto'] });
    const first = await renderHook(() => useDestinationSeason(KYOTO), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(first.result.current.status).toBe('ok'));
    expect(reader.paths).toEqual([`/v1/destinations/${KYOTO}/season`]);
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useDestinationSeason(KYOTO), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(second.result.current.status).toBe('stale'));
    expect(second.result.current).toMatchObject({
      source: 'cache',
      data: { months: expect.arrayContaining([expect.objectContaining({ month: 4 })]) },
    });
  });

  it('answers a destination with nothing reviewed as empty, not missing', async () => {
    const reader = recordedReader({ '/v1/destinations/': [200, 'season-empty'] });
    const { result } = await renderHook(() => useDestinationSeason('lisbon'), {
      wrapper: withReader(reader),
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ok', data: { months: [], events: [] } }),
    );
  });

  it('is missing offline with no copy, and asks nothing without a destination', async () => {
    const reader = recordedReader({});
    reader.online = false;
    const offline = await renderHook(() => useDestinationSeason('nowhere'), {
      wrapper: withReader(reader),
    });
    await waitFor(() =>
      expect(offline.result.current).toEqual({ status: 'missing', reason: 'offline' }),
    );
    const none = await renderHook(() => useDestinationSeason(null), {
      wrapper: withReader(reader),
    });
    expect(none.result.current).toEqual({ status: 'missing', reason: 'no_data' });
    expect(reader.paths).toEqual(['/v1/destinations/nowhere/season']);
  });
});

describe('cost indices', () => {
  it('reads the api, then its last good copy once offline', async () => {
    const reader = recordedReader({ '/v1/destinations/': [200, 'cost-indices-hotel'] });
    const first = await renderHook(() => useCostIndices('dest-hotel'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(first.result.current.status).toBe('ok'));
    expect(reader.paths).toEqual(['/v1/destinations/dest-hotel/cost-indices']);
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useCostIndices('dest-hotel'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(second.result.current.status).toBe('stale'));
    expect(second.result.current).toMatchObject({
      data: { indices: [{ stay_type: 'hotel', nightly_minor_low: 4000 }] },
    });
  });

  it('is missing for an unknown destination', async () => {
    const reader = recordedReader({ '/v1/destinations/': [404, 'error-not-found'] });
    const { result } = await renderHook(() => useCostIndices('atlantis'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'missing', reason: 'not_found' }));
  });
});

describe('crowd forecasts', () => {
  it('reads every curve from the api, then its last good copy once offline', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'crowd-forecasts-shrine'] });
    const first = await renderHook(() => useCrowdForecasts(SHRINE), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(first.result.current.status).toBe('ok'));
    expect(reader.paths).toEqual([`/v1/places/${SHRINE}/crowd-forecasts`]);
    await first.unmount();

    reader.online = false;
    const second = await renderHook(() => useCrowdForecasts(SHRINE), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(second.result.current.status).toBe('stale'));
    expect(second.result.current).toMatchObject({
      data: { curves: [{ source: 'besttime' }, { source: 'editorial' }] },
    });
  });

  it('refuses a body that is not the curves shape and keeps nothing', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'season-kyoto'] });
    const { result } = await renderHook(() => useCrowdForecasts('not-curves'), {
      wrapper: withReader(reader),
    });
    await waitFor(() => expect(result.current).toEqual({ status: 'missing', reason: 'error' }));
  });
});
