/**
 * Place search and the guest guide's page over the real local-first stack, with the api's answers
 * replayed at the network seam: a country nobody guides gets the guest guide's line, a live-guide
 * place opens its destination page and a guest place the guest page, nothing found asks for the
 * place, offline says so; the guest page draws the place facts and the brief with its sources,
 * saves the place, pitches to the only crew, lets the user pick among crews, and starts a solo trip
 * after the confirm.
 */
// Loops are timing, not layout: the tests see their resting frame.
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { toastQueue } from '@/motion';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { reconcileOnce } from '@/data/commands/reconcile';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { voteRoutes } from '../../routes';
import { CREW, KYOTO, queued, renderVote, seedCrew, until } from '../../test-support/vote-harness';
import {
  MARRAKECH,
  marrakechBriefFrames,
  moroccoResults,
  replayServices,
} from '../../test-support/replay-services';
import { GuestGuide as GuestGuidePage } from '../../premium/places/guest-guide';
import { SearchPlaces as SearchSheet } from '../../premium/places/search-places';
import { fxLine } from '../city-guide';

const SECOND_CREW = '0192f000-0000-7000-8000-00000000c1e1';
let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  return stack;
}

afterEach(async () => {
  jest.restoreAllMocks();
  (router.push as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  toastQueue.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function type(text: string) {
  await fireEvent.changeText(screen.getByTestId('place-search-field'), text);
}

describe('place search', () => {
  it('heads a country nobody guides and opens the guest page for a city', async () => {
    const s = await open();
    await renderVote(<SearchSheet crewId={CREW} />, s, replayServices({ results: moroccoResults }));
    expect(screen.getByTestId('place-search-idle')).toBeTruthy();
    await type('morocc');
    await until(() => screen.queryByTestId(`place-result-${MARRAKECH}`) !== null);
    expect(
      within(screen.getByTestId('place-search-unguided')).getByLabelText(
        /: Nobody guides Morocco yet, so I'll cover it\. The locals still turn up\.$/,
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`place-result-${MARRAKECH}`));
    expect(router.push).toHaveBeenCalledWith(voteRoutes.place(MARRAKECH, CREW));
  });

  it('opens the top result from the keyboard GO key', async () => {
    const s = await open();
    await renderVote(<SearchSheet crewId={CREW} />, s, replayServices({ results: moroccoResults }));
    const field = screen.getByTestId('place-search-field');
    await type('morocc');
    await until(() => screen.queryByTestId(`place-result-${MARRAKECH}`) !== null);
    await fireEvent(field, 'submitEditing');
    expect(router.push).toHaveBeenCalledWith(voteRoutes.place(MARRAKECH, CREW));
  });

  it('opens a live-guide place on its destination page', async () => {
    const s = await open();
    const kyoto = {
      place_id: KYOTO,
      name: 'Kyoto',
      country: 'Japan',
      country_code: 'JP',
      coverage: 'live' as const,
      guide: 'pon',
      locals: ['sika-deer', 'tanuki'],
    };
    await renderVote(<SearchSheet crewId={undefined} />, s, replayServices({ results: [kyoto] }));
    await type('kyoto');
    await until(() => screen.queryByTestId(`place-result-${KYOTO}`) !== null);
    expect(screen.queryByTestId('place-search-unguided')).toBeNull();
    await fireEvent.press(screen.getByTestId(`place-result-${KYOTO}`));
    expect(router.push).toHaveBeenCalledWith(voteRoutes.destination(KYOTO, undefined));
  });

  it('asks for a place nobody has yet', async () => {
    const s = await open();
    await renderVote(<SearchSheet crewId={CREW} />, s, replayServices({ results: [] }));
    await type('Atlantis');
    await until(() => screen.queryByTestId('place-search-empty') !== null);
    await fireEvent.press(screen.getByTestId('place-search-ask'));
    await until(() => toastQueue.getCurrent() !== null);
    expect(await queued(s, 'request_place')).toEqual([{ query: 'Atlantis' }]);
  });

  it('says when search is offline', async () => {
    const s = await open();
    await renderVote(<SearchSheet crewId={CREW} />, s, replayServices({ offline: true }));
    await type('Lisbon');
    await until(() => screen.queryByTestId('place-search-offline') !== null);
  });
});

describe('guest guide page', () => {
  it('draws the place facts and the brief with its sources', async () => {
    const s = await open();
    await renderVote(
      <GuestGuidePage placeId={MARRAKECH} crewId={CREW} />,
      s,
      replayServices({ brief: marrakechBriefFrames }),
    );
    await until(
      () => screen.queryByText('Marrakech is one of the imperial cities of Morocco.') !== null,
    );
    const facts = within(screen.getByTestId('guest-facts'));
    expect(facts.getByText('10 MAD ≈ $1')).toBeTruthy();
    const notes = within(screen.getByTestId('guest-notes'));
    expect(notes.getAllByText('en.wikivoyage.org').length).toBeGreaterThan(0);
  });

  it('saves the place and pitches it to the crew it was opened from', async () => {
    const s = await open();
    await renderVote(
      <GuestGuidePage placeId={MARRAKECH} crewId={CREW} />,
      s,
      replayServices({ brief: marrakechBriefFrames }),
    );
    await until(() => screen.queryByTestId('guest-pitch') !== null, 15_000);
    await fireEvent.press(screen.getByTestId('guest-save'));
    await until(() => screen.queryByLabelText('♥ Saved') !== null);
    expect(await queued(s, 'save_place')).toEqual([{ place_id: MARRAKECH }]);
    await fireEvent.press(screen.getByTestId('guest-pitch'));
    expect(router.push).toHaveBeenCalledWith(voteRoutes.pitch(CREW, MARRAKECH));
  });

  it('lets the user pick a crew when they are in several', async () => {
    const s = await open();
    await s.db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [SECOND_CREW, 'Work lot']);
    await s.db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES ('cm-second', ?, ?, 'active', '2026-09-05T00:00:00Z')`,
      [SECOND_CREW, s.uid],
    );
    await renderVote(
      <GuestGuidePage placeId={MARRAKECH} crewId={undefined} />,
      s,
      replayServices({ brief: marrakechBriefFrames }),
    );
    await until(() => screen.queryByTestId('guest-pitch') !== null, 15_000);
    await fireEvent.press(screen.getByTestId('guest-pitch'));
    await until(() => screen.queryByTestId(`guest-crew-${SECOND_CREW}`) !== null);
    await fireEvent.press(screen.getByTestId(`guest-crew-${SECOND_CREW}`));
    expect(router.push).toHaveBeenCalledWith(voteRoutes.pitch(SECOND_CREW, MARRAKECH));
  });

  async function startSolo(s: TestLocalFirst): Promise<string> {
    await renderVote(
      <GuestGuidePage placeId={MARRAKECH} crewId={undefined} />,
      s,
      replayServices({ brief: marrakechBriefFrames }),
    );
    await until(() => screen.queryByTestId('guest-solo') !== null, 15_000);
    await fireEvent.press(screen.getByTestId('guest-solo'));
    expect(
      within(screen.getByTestId('solo-confirm')).getByText('Just you, Marrakech'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('solo-start'));
    let sent = await queued(s, 'create_trip');
    for (let tries = 0; sent.length === 0 && tries < 50; tries += 1) {
      await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
      sent = await queued(s, 'create_trip');
    }
    const [trip] = sent;
    expect(trip).toMatchObject({ place_id: MARRAKECH, solo: true });
    expect(typeof trip?.['trip_id']).toBe('string');
    const [op] = await s.db.getAll<{ id: string }>(
      "SELECT id FROM commands WHERE cmd = 'create_trip'",
    );
    return op?.id ?? '';
  }

  /** The server's answer for `opId`, as it syncs down and settles the queue. */
  async function settle(s: TestLocalFirst, opId: string, code: string | null): Promise<void> {
    await s.db.execute(
      `INSERT INTO cmd_results (id, op_id, uid, cmd, status, code, detail, server_ts)
       VALUES (?, ?, ?, 'create_trip', ?, ?, NULL, '2026-10-01T06:00:00.000Z')`,
      [opId, opId, s.uid, code === null ? 'applied' : 'rejected', code],
    );
    await act(async () => {
      await reconcileOnce(s.db);
    });
  }

  it('starts a solo trip after the confirm, once the server has made it', async () => {
    const s = await open();
    const opId = await startSolo(s);
    expect(router.back).not.toHaveBeenCalled();
    await settle(s, opId, null);
    await until(() => (router.back as jest.Mock).mock.calls.length > 0);
  });

  it('says why a solo trip did not go through and stays on the confirm', async () => {
    const s = await open();
    const opId = await startSolo(s);
    await settle(s, opId, 'VALIDATION');
    await until(() => toastQueue.getCurrent() !== null);
    expect(toastQueue.getCurrent()?.title).toBe('That didn’t go through');
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('solo-confirm')).toBeTruthy();
  });

  it('opens the solo trip at once offline, to fill in when it lands', async () => {
    const s = await open();
    s.network.set(false);
    await startSolo(s);
    await until(() => (router.back as jest.Mock).mock.calls.length > 0);
  });
});

describe('guest page solo confirm', () => {
  it('puts the confirm away with Not now and stays on the page', async () => {
    const s = await open();
    await renderVote(
      <GuestGuidePage placeId={MARRAKECH} crewId={undefined} />,
      s,
      replayServices({ brief: marrakechBriefFrames }),
    );
    await until(() => screen.queryByTestId('guest-solo') !== null, 15_000);
    await fireEvent.press(screen.getByTestId('guest-solo'));
    expect(screen.getByTestId('solo-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('solo-cancel'));
    expect(screen.queryByTestId('solo-confirm')).toBeNull();
    expect(screen.getByTestId('guest-pitch')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(await queued(s, 'create_trip')).toEqual([]);
  });
});

describe('fx line', () => {
  it('reads weak currencies by the tens and strong ones by the unit', () => {
    expect(fxLine('en', { base: 'MAD', quote: 'USD', rate: 0.1 })).toBe('10 MAD ≈ $1');
    expect(fxLine('en', { base: 'EUR', quote: 'USD', rate: 1.08 })).toBe('1 EUR ≈ $1.08');
    expect(fxLine('en', { base: 'VND', quote: 'USD', rate: 0 })).toBeNull();
  });
});
