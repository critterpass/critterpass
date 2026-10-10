import {
  setupChecklist,
  sketchTiles,
  type ChecklistInputs,
  type MemberProgress,
} from '../checklist';

const way = {
  mode: 'flight',
  from: 'SIN',
  arrivesAt: null,
  estimateMinor: 19000,
  currency: 'USD',
  bookingId: null,
};

function inputs(overrides: Partial<ChecklistInputs> = {}): ChecklistInputs {
  const progress = new Map<string, MemberProgress>([
    ['win', { daysIn: true, maxIn: true, way }],
    ['ray', { daysIn: true, maxIn: false, way: null }],
    ['dev', { daysIn: false, maxIn: true, way }],
  ]);
  return {
    members: ['win', 'ray', 'dev'],
    me: 'ray',
    isOrganiser: false,
    isSolo: false,
    datesLocked: true,
    progress,
    mustDoOwners: new Set(['win', 'dev']),
    budgetLocked: false,
    roomsLocked: false,
    routeOn: true,
    stopCount: 0,
    ...overrides,
  };
}

const states = (list: ReturnType<typeof setupChecklist>) =>
  Object.fromEntries(list.rows.map((row) => [row.key, row.state]));

describe('setupChecklist', () => {
  it('holds every row but the dates until the dates are locked', () => {
    const list = setupChecklist(inputs({ datesLocked: false }));
    expect(states(list)).toEqual({
      dates: 'open',
      free_days: 'waiting',
      budget: 'waiting',
      must_dos: 'waiting',
      getting_there: 'waiting',
      route: 'waiting',
      rooms: 'waiting',
    });
    expect(list.canDraft).toBe(false);
  });

  it('opens the rest in any order once the dates lock, naming who is still to answer', () => {
    const list = setupChecklist(inputs());
    expect(states(list).dates).toBe('done');
    const free = list.rows.find((row) => row.key === 'free_days');
    expect(free).toMatchObject({
      position: 2,
      state: 'open',
      done: ['win', 'ray'],
      missing: ['dev'],
    });
    const budget = list.rows.find((row) => row.key === 'budget');
    expect(budget).toMatchObject({ state: 'open', done: ['win', 'dev'], missing: ['ray'] });
    expect(list.rows.find((row) => row.key === 'getting_there')?.missing).toEqual(['ray']);
  });

  it('counts a member ready once all of their own part is in', () => {
    const list = setupChecklist(inputs());
    expect(list.ready).toEqual(['win']);
    expect(list.myPart).toEqual([
      { key: 'max', done: false },
      { key: 'must_do', done: false },
      { key: 'free_days', done: true },
      { key: 'getting_there', done: false },
    ]);
    expect(list.myLeft).toBe(3);
  });

  it('switches off what a trip does not need', () => {
    const solo = setupChecklist(inputs({ isSolo: true, routeOn: false, members: ['ray'] }));
    expect(states(solo)).toMatchObject({ budget: 'off', route: 'off', rooms: 'off' });
    expect(solo.myPart.map((part) => part.key)).toEqual(['must_do', 'free_days', 'getting_there']);
  });

  it('lets the organiser draft as soon as the dates are locked', () => {
    expect(setupChecklist(inputs({ isOrganiser: true })).canDraft).toBe(true);
  });
});

describe('sketchTiles', () => {
  it('marks the sketched days of the trip', () => {
    expect(sketchTiles(4, [1, 3])).toEqual([
      { dayNo: 1, sketched: true },
      { dayNo: 2, sketched: false },
      { dayNo: 3, sketched: true },
      { dayNo: 4, sketched: false },
    ]);
    expect(sketchTiles(null, [1])).toEqual([]);
  });
});
