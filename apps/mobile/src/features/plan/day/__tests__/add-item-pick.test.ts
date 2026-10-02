import { describe, expect, it } from '@jest/globals';

import { NO_PICK, pickStep, shownPlaces } from '../add-pick';
import { LAB_PLACES } from '../dev/lab-fixtures';

const [first, second, third] = LAB_PLACES as [
  (typeof LAB_PLACES)[number],
  (typeof LAB_PLACES)[number],
  (typeof LAB_PLACES)[number],
];
const rows = [first, second, third];

describe('picking a place in the add sheet', () => {
  it('shows every result until a place is picked', () => {
    expect(shownPlaces(rows, NO_PICK)).toEqual(rows);
  });

  it('folds the list to the picked place', () => {
    const picked = pickStep(NO_PICK, { type: 'pick', place: second });
    expect(picked).toEqual({ place: second, browsing: false });
    expect(shownPlaces(rows, picked)).toEqual([second]);
  });

  it('opens the list again to change the pick, keeping it until another is picked', () => {
    const picked = pickStep(NO_PICK, { type: 'pick', place: second });
    const browsing = pickStep(picked, { type: 'browse' });
    expect(browsing).toEqual({ place: second, browsing: true });
    expect(shownPlaces(rows, browsing)).toEqual(rows);
    const changed = pickStep(browsing, { type: 'pick', place: third });
    expect(shownPlaces(rows, changed)).toEqual([third]);
  });

  it('keeps the folded pick when browsing starts with nothing picked or the list already open', () => {
    expect(pickStep(NO_PICK, { type: 'browse' })).toBe(NO_PICK);
    const browsing = { place: first, browsing: true };
    expect(pickStep(browsing, { type: 'browse' })).toBe(browsing);
  });

  it('drops the pick on a new search or another tab', () => {
    const picked = pickStep(NO_PICK, { type: 'pick', place: first });
    expect(pickStep(picked, { type: 'clear' })).toEqual(NO_PICK);
    expect(shownPlaces(rows, pickStep(picked, { type: 'clear' }))).toEqual(rows);
  });
});
