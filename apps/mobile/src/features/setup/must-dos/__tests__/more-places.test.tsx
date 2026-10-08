/**
 * "More places" in the add sheet over the real local-first stack and command client, with the api
 * as the network boundary: when the guide finds little, live results show with Foursquare's
 * attribution; a pick adds our own open-data place (its id and name, never Foursquare's), and a
 * place open data does not have says it cannot be saved. Nothing from the live search is written
 * to the phone.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import type { ApiRead } from '../../data/services';
import { DEV, TRIP_ID } from '../../scenes/fixtures';
import { AddMustDoSheet } from '../add-must-do-sheet';
import { renderWith, seedKyoto, services } from '../test-support/must-dos-harness';

const OUR_POI = '0199a6f0-0000-7000-8000-0000000f0e01';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function answer(path: string): ApiRead {
  if (path.startsWith('/v1/places/search/live/resolve?')) {
    return path.includes('fsq_place_id=4b0588c1f964a5203a8e22e3')
      ? { kind: 'ok', body: { status: 'ready', poiId: OUR_POI, name: 'Kōdai-ji' } }
      : { kind: 'ok', body: { status: 'unavailable' } };
  }
  if (path.startsWith('/v1/places/search/live?')) {
    return {
      kind: 'ok',
      body: {
        results: [
          {
            fsqPlaceId: '4b0588c1f964a5203a8e22e3',
            poiId: null,
            name: 'Kodaiji Temple',
            address: 'Higashiyama',
          },
          {
            fsqPlaceId: '5a1b2c3d4e5f60718293a4b5',
            poiId: null,
            name: 'Kodai Tea Stand',
            address: null,
          },
        ],
        attribution: { name: 'Foursquare', url: 'https://foursquare.com' },
      },
    };
  }
  return { kind: 'ok', body: { results: [] } };
}

async function queuedItems(): Promise<string> {
  const rows = await stack!.db.getAll<{ items: string }>(
    "SELECT json_extract(envelope, '$.payload.items') AS items FROM commands WHERE cmd = 'set_must_dos'",
  );
  return rows.map((row) => row.items).join('');
}

describe('More places', () => {
  it('adds our own place behind a live result and explains one that cannot be saved', async () => {
    stack = await openTestLocalFirst({ uid: DEV, holdUploads: true });
    await seedKyoto(stack);
    const api = services(answer);
    await renderWith(stack, api.value, <AddMustDoSheet tripId={TRIP_ID} />);
    await fireEvent.changeText(await screen.findByTestId('add-must-do-field'), 'kodai');

    expect(await screen.findByText('Powered by Foursquare')).toBeTruthy();
    expect(api.paths.some((path) => path.startsWith('/v1/places/search/live?q=kodai'))).toBe(true);

    await fireEvent.press(screen.getByTestId('add-must-do-more-5a1b2c3d4e5f60718293a4b5'));
    expect(await screen.findByText(/This place can’t be saved/)).toBeTruthy();
    expect(await queuedItems()).toBe('');

    await fireEvent.press(screen.getByTestId('add-must-do-more-4b0588c1f964a5203a8e22e3'));
    await waitFor(async () => {
      const items = JSON.parse(await queuedItems()) as { text: string; poi_id?: string }[];
      expect(items).toEqual([expect.objectContaining({ text: 'Kōdai-ji', poi_id: OUR_POI })]);
    });
    const written = await stack.db.getAll<{ n: number }>(
      "SELECT count(*) AS n FROM pois WHERE name LIKE 'Kodai%'",
    );
    expect(written).toEqual([{ n: 0 }]);
  });

  it('asks for nothing live while the guide already found plenty', async () => {
    stack = await openTestLocalFirst({ uid: DEV, holdUploads: true });
    await seedKyoto(stack);
    const plenty = Array.from({ length: 5 }, (_, index) => ({
      id: `0199a6f0-0000-7000-8000-0000000f0f0${index}`,
      name: `Temple ${index}`,
      address: null,
      tags: [],
    }));
    const api = services((path) =>
      path.startsWith('/v1/places/search?')
        ? { kind: 'ok', body: { results: plenty } }
        : answer(path),
    );
    await renderWith(stack, api.value, <AddMustDoSheet tripId={TRIP_ID} />);
    await fireEvent.changeText(await screen.findByTestId('add-must-do-field'), 'temple');
    expect(
      await screen.findByTestId('add-must-do-place-0199a6f0-0000-7000-8000-0000000f0f04'),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(api.paths.filter((path) => path.startsWith('/v1/places/search/live'))).toEqual([]);
    expect(screen.queryByText('Powered by Foursquare')).toBeNull();
  });
});
