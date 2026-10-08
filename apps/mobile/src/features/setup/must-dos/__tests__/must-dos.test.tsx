/**
 * The must-dos step and the add sheet over the real local-first stack and command client, with
 * the api as the network boundary: an offline add queues `set_must_dos` and shows at once as
 * pending; a fit the guide checked shows when its synced row carries it; a crewmate typing shows
 * as a dashed row; no screen ever says the app entered anyone into a lottery.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import type { ApiRead, SetupServices } from '../../data/services';
import { DEV, kyotoTrip, MAYA, sceneFrame, TRIP_ID, WINSTON } from '../../scenes/fixtures';
import { AddMustDoSheet } from '../add-must-do-sheet';
import { draftStateOf, MustDosStep } from '../must-dos-step';
import { MUST_DOS_SCENES } from '../scenes';
import {
  renderPlain,
  renderWith,
  seedKyoto,
  seedMustDo,
  services,
} from '../test-support/must-dos-harness';

const browseBody: unknown = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'places-browse-kyoto.json'), 'utf8'),
);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function textsOf(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(textsOf);
  if (node !== null && typeof node === 'object' && 'children' in node) {
    return textsOf(node.children);
  }
  return [];
}

function step(me: string) {
  const trip = kyotoTrip({ step: 'must_dos', dates: true, me });
  return <MustDosStep trip={trip} shell={sceneFrame(trip, 'must_dos')} />;
}

describe('adding a must-do', () => {
  it('queues the whole list offline and shows the new row as pending at once', async () => {
    stack = await openTestLocalFirst({ uid: DEV, holdUploads: true });
    await seedKyoto(stack);
    const api = services();
    const view = await renderWith(stack, api.value, <AddMustDoSheet tripId={TRIP_ID} />);
    await fireEvent.changeText(await screen.findByTestId('add-must-do-field'), 'ramen crawl');
    await waitFor(() => expect(api.paths[0]).toContain('/v1/places/search?q=ramen+crawl'));
    await fireEvent.press(await screen.findByTestId('add-must-do-keep'));
    await waitFor(async () => {
      const rows = await stack!.db.getAll<{ items: string }>(
        "SELECT json_extract(envelope, '$.payload.items') AS items FROM commands WHERE cmd = 'set_must_dos'",
      );
      expect(rows).toHaveLength(1);
      const items = JSON.parse(rows[0]!.items) as { text: string; priority: number }[];
      expect(items).toEqual([expect.objectContaining({ text: 'ramen crawl', priority: 0 })]);
    });
    await view.unmount();

    await renderWith(stack, api.value, step(DEV));
    expect(await screen.findByText(/ramen crawl/i)).toBeTruthy();
    expect(screen.getByText(/sends when you’re back online/i)).toBeTruthy();
  });
});

describe('a finished setup', () => {
  it('leads the organiser to the draft, and everyone to the trip once the plan is out', () => {
    const at = (status: string, isOrganiser: boolean, step = 'done') =>
      draftStateOf({ step, status, isOrganiser });
    expect(at('setup', true, 'must_dos')).toBeNull();
    expect(at('drafting', true)).toBe('writing');
    expect(at('draft_review', true)).toBe('ready');
    // A member has no draft to open; the plan, once proposed, is theirs to open too.
    expect(at('drafting', false)).toBeNull();
    expect(at('proposed', false)).toBe('planned');
    expect(at('confirmed', true)).toBe('planned');
    expect(at('cancelled', true)).toBeNull();
  });
});

describe('the list', () => {
  it('shows the fit once the synced row carries it', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedKyoto(stack);
    const id = '0199a6f0-0000-7000-8000-0000000d0101';
    await seedMustDo(stack, { id, owner: MAYA, title: 'Tea ceremony' });
    await renderWith(stack, services().value, step(WINSTON));
    expect(await screen.findByText(/tea ceremony/i)).toBeTruthy();
    expect(screen.getByText(/checking them against the dates/i)).toBeTruthy();

    await seedMustDo(stack, { id, owner: MAYA, title: 'Tea ceremony', fit: 'clash' });
    expect(await screen.findByTestId(`must-do-pill-${id}`)).toBeTruthy();
    expect(screen.getByText(/^clash$/i)).toBeTruthy();
    expect(screen.getByText(/one clashes with the dates/i)).toBeTruthy();
  });

  it('offers adding one, not drafting, until someone has added one', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedKyoto(stack);
    await renderWith(stack, services().value, step(WINSTON));
    expect(await screen.findByTestId('must-dos-add')).toBeTruthy();
    expect(screen.queryByTestId('must-dos-draft')).toBeNull();
  });
});

describe('reading places through the api', () => {
  it('shows the step and the add field at once, and the examples once the browse answers', async () => {
    stack = await openTestLocalFirst({ uid: WINSTON, holdUploads: true });
    await seedKyoto(stack);
    let answer: (read: ApiRead) => void = () => undefined;
    const pending = new Promise<ApiRead>((resolve) => {
      answer = resolve;
    });
    const api: SetupServices = { ...services().value, getJson: () => pending };
    const sheet = await renderWith(stack, api, <AddMustDoSheet tripId={TRIP_ID} />);
    expect(await screen.findByTestId('add-must-do-field')).toBeTruthy();
    await sheet.unmount();

    await renderWith(stack, api, step(WINSTON));
    expect(await screen.findByTestId('must-dos-add')).toBeTruthy();
    expect(screen.queryByTestId('must-dos-examples')).toBeNull();
    answer({ kind: 'ok', body: browseBody });
    expect(await screen.findByTestId('must-dos-examples')).toBeTruthy();
    expect(screen.getByLabelText(/fushimi inari taisha/i)).toBeTruthy();
  });
});

describe('lottery copy', () => {
  it('never says anyone was entered, only that each person enters on the official site', async () => {
    const seen: string[] = [];
    for (const scene of MUST_DOS_SCENES) {
      const view = await renderPlain(scene.render());
      seen.push(...textsOf(view.toJSON()));
      await view.unmount();
    }
    const copy = seen.join('\n');
    expect(copy).not.toMatch(/\bentered\b/iu);
    expect(copy).toMatch(/each of you enters on the official site/iu);
    expect(copy).toMatch(/entries close/iu);
  });
});
