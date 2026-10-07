/**
 * A recap link on the phone: which link "Share a link" hands out, what "Stop sharing" covers, and
 * where a link opened in the app lands. The reader is the network boundary; its answers here are
 * the routes' wire shapes.
 */
import { describe, expect, it } from '@jest/globals';
import { publicRecapSchema, type PublicRecap, type RecapLinks } from '@cp/domain';

import {
  createLastGoodCache,
  type ReaderResponse,
  type TravelDataReader,
} from '@/data/travel-data/client';

import {
  publicRecapPath,
  recapLinksPath,
  rememberedLinks,
  resolveRecapLink,
  reusableLink,
  stoppableLinks,
} from '../recap-link';

const TOKEN = 'abcdefghijklmnopqrstuvwx';
const TRIP = '0192f000-0000-7000-8000-00000000a001';
const RECAP: PublicRecap = {
  kind: 'recap',
  recap_id: '0192f000-0000-7000-8000-00000000c001',
  destination_name: 'Đà Lạt',
  travel_month: 10,
  travel_year: 2026,
  days: 3,
  travellers: 3,
  crew_names: ['Anna', 'Ben'],
  distance_m: 41_200,
  distance_estimated: false,
  places_count: 1,
  places: [{ name: 'Hồ Xuân Hương', category: 'nature' }],
  critters_found: 5,
  new_critters: 2,
};
const MINE = '0192f000-0000-7000-8000-00000000d001';
const THEIRS = '0192f000-0000-7000-8000-00000000d002';
const link = (link_id: string, mine: boolean, can_revoke: boolean) => ({
  link_id,
  mine,
  can_revoke,
  created_at: '2026-10-07T04:00:00.000Z',
});
const LINKS: RecapLinks = {
  trip_id: TRIP,
  links: [link(MINE, true, true), link(THEIRS, false, false)],
};

function reader(answers: Record<string, ReaderResponse | Error>) {
  const asked: string[] = [];
  const double: TravelDataReader = {
    getJson: (path) => {
      asked.push(path);
      const answer = answers[path] ?? { status: 404, body: null };
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return { double, asked };
}

describe('sharing a recap link', () => {
  const remembered = { linkId: MINE, url: `https://critterpass.app/rc/${TOKEN}?c=copy` };

  it('hands out the remembered link only while the server lists it as the traveller’s live link', () => {
    expect(reusableLink(remembered, LINKS)).toEqual(remembered);
    expect(
      reusableLink(remembered, { trip_id: TRIP, links: [link(THEIRS, false, false)] }),
    ).toBeNull();
    expect(reusableLink({ ...remembered, linkId: THEIRS }, LINKS)).toBeNull();
    expect(reusableLink(remembered, null)).toBeNull();
    expect(reusableLink(null, LINKS)).toBeNull();
  });

  it('remembers one link per recap until it is switched off', () => {
    const store = rememberedLinks(createLastGoodCache('cp-recap-links-test'));
    expect(store.get(RECAP.recap_id)).toBeNull();
    store.set(RECAP.recap_id, remembered);
    expect(store.get(RECAP.recap_id)).toEqual(remembered);
    expect(store.get(TRIP)).toBeNull();
    store.forget(RECAP.recap_id);
    expect(store.get(RECAP.recap_id)).toBeNull();
  });

  it('counts only the links the traveller may switch off', () => {
    expect(stoppableLinks(LINKS)).toBe(1);
    expect(
      stoppableLinks({
        trip_id: TRIP,
        links: [link(MINE, false, true), link(THEIRS, false, true)],
      }),
    ).toBe(2);
    expect(stoppableLinks(null)).toBe(0);
  });
});

describe('a recap link opened in the app', () => {
  const publicPath = publicRecapPath(TOKEN);
  const ownPath = recapLinksPath(RECAP.recap_id);

  it('opens a traveller’s own recap', async () => {
    expect(publicRecapSchema.safeParse(RECAP).success).toBe(true);
    const { double, asked } = reader({
      [publicPath]: { status: 200, body: RECAP },
      [ownPath]: { status: 200, body: LINKS },
    });
    expect(await resolveRecapLink(double, TOKEN)).toEqual({ kind: 'mine', tripId: TRIP });
    expect(asked).toEqual([`/v1/public/recap/${TOKEN}`, `/v1/recaps/${RECAP.recap_id}/links`]);
  });

  it('shows anyone else the public recap, also when the travellers’ read cannot be reached', async () => {
    const stranger = reader({ [publicPath]: { status: 200, body: RECAP } });
    expect(await resolveRecapLink(stranger.double, TOKEN)).toEqual({
      kind: 'public',
      recap: RECAP,
    });
    const flaky = reader({
      [publicPath]: { status: 200, body: RECAP },
      [ownPath]: new Error('offline'),
    });
    expect(await resolveRecapLink(flaky.double, TOKEN)).toEqual({ kind: 'public', recap: RECAP });
  });

  it('opens nothing for a link that was switched off, without asking who the viewer is', async () => {
    const { double, asked } = reader({ [ownPath]: { status: 200, body: LINKS } });
    expect(await resolveRecapLink(double, TOKEN)).toEqual({ kind: 'gone' });
    expect(asked).toEqual([publicPath]);
    const malformed = reader({ [publicPath]: { status: 200, body: { kind: 'plan' } } });
    expect(await resolveRecapLink(malformed.double, TOKEN)).toEqual({ kind: 'gone' });
  });

  it('offers another try when there is no answer', async () => {
    expect(await resolveRecapLink(null, TOKEN)).toEqual({ kind: 'unreachable' });
    const offline = reader({ [publicPath]: new Error('offline') });
    expect(await resolveRecapLink(offline.double, TOKEN)).toEqual({ kind: 'unreachable' });
    const down = reader({ [publicPath]: { status: 503, body: null } });
    expect(await resolveRecapLink(down.double, TOKEN)).toEqual({ kind: 'unreachable' });
  });
});
