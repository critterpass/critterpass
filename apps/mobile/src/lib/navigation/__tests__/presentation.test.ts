import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  oneCardRoutes,
  openedPath,
  PRESENTED_ROUTES,
  presentationOf,
  screenPlacement,
  type ScreenPresentation,
} from '../presentation';

const SHEET: ScreenPresentation = { kind: 'sheet', detents: [1] };

describe('premium presentations', () => {
  it('names a route file for every listed sheet and modal', () => {
    const app = path.join(__dirname, '../../../app');
    for (const route of PRESENTED_ROUTES) {
      expect([route, existsSync(path.join(app, `${route}.tsx`))]).toEqual([route, true]);
    }
  });

  it('treats an unlisted (modal) screen as one that draws itself, and pages as pushes', () => {
    expect(presentationOf('(modal)/not-listed/yet')).toEqual({ kind: 'drawn' });
    expect(presentationOf('(modal)')).toEqual({ kind: 'drawn' });
    expect(presentationOf('vote/[pollId]/index')).toBeUndefined();
    expect(presentationOf('vote/new-poll')).toEqual(SHEET);
  });

  it('pushes what is in each plan inside the paywall sheet', () => {
    expect(presentationOf('(modal)/paywall/index')).toEqual(SHEET);
    expect(presentationOf('(modal)/paywall/compare')).toBeUndefined();
    expect(presentationOf('(modal)/boost/[tripId]')).toEqual(SHEET);
  });
});

describe('openedPath', () => {
  it('follows the first screen of each nested stack', () => {
    const route = {
      name: '(trip)',
      state: {
        routes: [
          { name: '[tripId]', state: { routes: [{ name: 'add/[placeId]' }, { name: 'x' }] } },
        ],
      },
    };
    expect(openedPath(route)).toBe('(trip)/[tripId]/add/[placeId]');
  });

  it('reads the link params before the nested navigators have rendered', () => {
    const route = {
      name: '(trip)',
      params: { screen: '[tripId]', params: { screen: 'check/gap', params: { tripId: 't' } } },
    };
    expect(openedPath(route)).toBe('(trip)/[tripId]/check/gap');
  });

  it('prefers the child state held on the route over stale params', () => {
    const route = { name: 'vote', params: { screen: 'new-poll' } };
    const symbol = Symbol('CHILD_STATE');
    Object.assign(route, { [symbol]: { routes: [{ name: '[pollId]/index' }] } });
    expect(openedPath(route)).toBe('vote/[pollId]/index');
  });
});

describe('screenPlacement', () => {
  const stack = (index: number) => ({ type: 'stack', index });

  it('is a root on a tab’s first screen', () => {
    expect(
      screenPlacement([stack(0), { type: 'tab', index: 2 }], '(tabs)/wallet/index', undefined),
    ).toEqual({ kind: 'root', tab: true });
  });

  it('is pushed on its own stack, and pushed with its group when it is the group’s first page', () => {
    expect(screenPlacement([stack(1), stack(1)], 'crew/[crewId]/chat', undefined)).toEqual({
      kind: 'pushed',
      ownStack: true,
    });
    expect(screenPlacement([stack(0), stack(1)], 'crew/[crewId]/chat', undefined)).toEqual({
      kind: 'pushed',
      ownStack: false,
    });
  });

  it('is presented when its group was opened on it as a sheet or modal', () => {
    expect(screenPlacement([stack(0), stack(2)], 'vote/new-poll', undefined)).toEqual({
      kind: 'presented',
      presentation: SHEET,
      ownStack: false,
    });
    expect(
      screenPlacement([stack(0), stack(0), stack(1)], '(trip)/[tripId]/settings/dates', undefined),
    ).toEqual({ kind: 'presented', presentation: { kind: 'modal' }, ownStack: false });
  });

  it('reads its own presentation when its stack presented it, and is pushed again inside a sheet', () => {
    expect(screenPlacement([stack(1)], 'you/appearance', SHEET)).toEqual({
      kind: 'presented',
      presentation: SHEET,
      ownStack: true,
    });
    // A page pushed inside the sheet the vote group was opened on.
    expect(screenPlacement([stack(1), stack(2)], 'vote/[pollId]/index', undefined)).toEqual({
      kind: 'pushed',
      ownStack: true,
    });
  });

  it('is an untabbed root when a cold link opened it with nothing under it', () => {
    expect(screenPlacement([stack(0), stack(0)], 'community/[id]', undefined)).toEqual({
      kind: 'root',
      tab: false,
    });
  });
});

describe('one card at a time', () => {
  const kinds: Record<string, ScreenPresentation | undefined> = {
    page: undefined,
    sheet: SHEET,
    modal: { kind: 'modal' },
    cover: { kind: 'cover' },
    drawn: { kind: 'drawn' },
  };
  const open = (...names: string[]) =>
    oneCardRoutes(
      names.map((name, index) => ({ name, key: `${name}-${String(index)}` })),
      (route) => kinds[route.name],
    ).map((route) => route.name);

  it('lets a page opened from a sheet replace the sheet', () => {
    expect(open('page', 'sheet', 'page')).toEqual(['page', 'page']);
    expect(open('page', 'modal', 'page')).toEqual(['page', 'page']);
  });

  it('lets a sheet opened from a sheet replace it, and every sheet under it', () => {
    expect(open('page', 'sheet', 'modal', 'sheet')).toEqual(['page', 'sheet']);
  });

  it('lets a page opened from a cover replace the cover, and a sheet sit over it', () => {
    expect(open('page', 'cover', 'page')).toEqual(['page', 'page']);
    expect(open('page', 'sheet', 'cover', 'page')).toEqual(['page', 'page']);
    expect(open('page', 'cover', 'sheet')).toEqual(['page', 'cover', 'sheet']);
  });

  it('keeps covers and see-through cards over what opened them', () => {
    expect(open('page', 'sheet', 'cover')).toEqual(['page', 'sheet', 'cover']);
    expect(open('page', 'sheet', 'drawn')).toEqual(['page', 'sheet', 'drawn']);
    expect(open('page', 'drawn', 'page')).toEqual(['page', 'drawn', 'page']);
  });

  it('leaves pushes over pages and the first route alone', () => {
    expect(open('page', 'page', 'page')).toEqual(['page', 'page', 'page']);
    expect(open('sheet', 'page')).toEqual(['sheet', 'page']);
  });
});
