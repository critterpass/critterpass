import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { isRestorablePath, ONE_SHOT_ROUTES, restorableState } from '../restore-filter';
import { SHEET_ROUTES } from '../sheet-routes';

interface Route {
  name: string;
  key?: string;
  params?: object;
  state?: State;
}
interface State {
  type: 'stack' | 'tab';
  index: number;
  routes: Route[];
}

const stack = (...routes: Route[]): State => ({ type: 'stack', index: routes.length - 1, routes });
const tabs = (index: number, ...routes: Route[]): State => ({ type: 'tab', index, routes });
const screen = (name: string, state?: State): Route => (state ? { name, state } : { name });

/** The app's root as the router saves it: the root stack inside its wrapper route. */
const root = (...routes: Route[]): State => stack(screen('__root', stack(...routes)));
const HOME = screen('(tabs)', tabs(0, screen('index'), screen('trips'), screen('wallet')));

/** The screen paths left in front after the filter, outermost first; `null` when nothing is left. */
function names(state: State | undefined): unknown {
  if (state === undefined) return null;
  return state.routes.map((route) =>
    route.state === undefined ? route.name : { [route.name]: names(route.state) },
  );
}

describe('what a cold start may reopen', () => {
  it('keeps an ordinary pushed stack exactly as it was saved', () => {
    const saved = root(
      HOME,
      screen('crew', stack(screen('[crewId]/chat/index'), screen('[crewId]/settings'))),
      screen('(trip)', stack(screen('[tripId]', stack(screen('plan/index'), screen('plan/map'))))),
      screen('money', stack(screen('settle'))),
    );
    expect(restorableState(saved)).toBe(saved);
  });

  it('cuts the stack at the first sheet or rise of the modal group', () => {
    const saved = root(
      HOME,
      screen('you', stack(screen('index'))),
      screen('(modal)', stack(screen('paywall/index'))),
      // A page opened from the sheet goes with it.
      screen('you', stack(screen('plan/index'))),
    );
    const kept = restorableState(saved);
    expect(names(kept)).toEqual([
      { __root: [{ '(tabs)': ['index', 'trips', 'wallet'] }, { you: ['index'] }] },
    ]);
    expect(kept?.routes[0]?.state?.index).toBe(1);
  });

  it.each([...ONE_SHOT_ROUTES].filter((route) => !route.startsWith('(tabs)/')))(
    'cuts the one-shot screen %s',
    (route) => {
      const [group = '', ...rest] = route.split('/');
      // A screen straight in the root stack, or inside its group's own stack.
      const nested = ['vote', '(trip)'].includes(group);
      const top = nested
        ? screen(
            group,
            stack(
              screen(nested && group === 'vote' ? '[pollId]/index' : 'help/index'),
              screen(rest.join('/')),
            ),
          )
        : screen(route);
      const kept = restorableState(root(HOME, top));
      const under = nested
        ? [{ [group]: [group === 'vote' ? '[pollId]/index' : 'help/index'] }]
        : [];
      expect(names(kept)).toEqual([
        { __root: [{ '(tabs)': ['index', 'trips', 'wallet'] }, ...under] },
      ]);
    },
  );

  it.each([...SHEET_ROUTES])('cuts the sheet route %s', (route) => {
    // Each segment that is a navigator of its own nests one stack deeper.
    const navigators = [
      '(trip)/[tripId]/draft',
      '(trip)/[tripId]/setup',
      '(trip)/[tripId]',
      '(trip)',
    ];
    const navigator =
      navigators.find((prefix) => route.startsWith(`${prefix}/`)) ?? route.split('/')[0] ?? '';
    const name = route.slice(navigator.length + 1);
    let top = stack(screen('page'), screen(name), screen('page-over-the-sheet'));
    let under: unknown = ['page'];
    const [group = '', ...inner] = navigator.split('/');
    for (const segment of inner.reverse()) {
      top = stack(screen(segment, top));
      under = [{ [segment]: under }];
    }
    const kept = restorableState(root(HOME, screen(group, top), screen('inbox')));
    expect(names(kept)).toEqual([
      { __root: [{ '(tabs)': ['index', 'trips', 'wallet'] }, { [group]: under }] },
    ]);
  });

  it('drops a group whose only screen was a sheet, and everything opened from it', () => {
    const saved = root(
      HOME,
      screen('crew', stack(screen('index'), screen('[crewId]/settings'))),
      screen('crew', stack(screen('[crewId]/invite'))),
    );
    expect(names(restorableState(saved))).toEqual([
      { __root: [{ '(tabs)': ['index', 'trips', 'wallet'] }] },
    ]);
  });

  it('reopens a tab on its first screen when its stack ended on a one-shot screen, keeping pages over the tabs', () => {
    const wallet = screen('wallet', stack(screen('money/index'), screen('mailbox/connected')));
    const saved = root(
      screen('(tabs)', tabs(2, screen('index'), screen('trips'), wallet)),
      screen('inbox', stack(screen('index'))),
    );
    const kept = restorableState(saved);
    expect(names(kept)).toEqual([
      {
        __root: [
          { '(tabs)': ['index', 'trips', { wallet: ['money/index'] }] },
          { inbox: ['index'] },
        ],
      },
    ]);
    // The tab in front is still the wallet.
    expect(kept?.routes[0]?.state?.routes[0]?.state?.index).toBe(2);

    const only = root(
      screen(
        '(tabs)',
        tabs(2, screen('index'), screen('wallet', stack(screen('mailbox/connected')))),
      ),
    );
    expect(names(restorableState(only))).toEqual([{ __root: [{ '(tabs)': ['index', 'wallet'] }] }]);
  });

  it('has nothing to restore when the only screen was a dead link or the closed-account page', () => {
    expect(restorableState(root(screen('+not-found')))).toBeUndefined();
    expect(restorableState(root(screen('account-closed')))).toBeUndefined();
    expect(
      restorableState(root(screen('(modal)', stack(screen('guide/[threadId]'))))),
    ).toBeUndefined();
  });

  it('names a route file for every one-shot screen', () => {
    const app = path.join(__dirname, '../../../app');
    for (const route of ONE_SHOT_ROUTES) {
      expect([route, existsSync(path.join(app, `${route}.tsx`))]).toEqual([route, true]);
      expect(isRestorablePath(route)).toBe(false);
    }
    expect(isRestorablePath('vote/[pollId]/index')).toBe(true);
  });
});
