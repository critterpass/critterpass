/**
 * Add to plan before there is a plan the person can see (a member before it is shared): the sheet
 * never names a day it does not have; it says who is putting the plan together and saves to Ideas.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { saveToIdeasLabel, sheetWords, type SheetState } from '../add-states-copy';

const state: SheetState = {
  waiting: false,
  nowhere: true,
  anyway: false,
  inPlan: null,
  stays: false,
  guide: 'Tokek',
  dayLabel: '',
  time: '',
  organiser: false,
};

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('sheetWords before the plan is shared', () => {
  it('offers to save it and names the organiser', () => {
    const words = sheetWords({ ...state, beforePlan: { organiser: 'Linh' } });
    expect(words.cta).toBe(saveToIdeasLabel());
    expect(words.line).toContain('Linh');
  });

  it('still says so when the phone does not know who organises', () => {
    const words = sheetWords({ ...state, beforePlan: { organiser: null } });
    expect(words.cta).toBe(saveToIdeasLabel());
    expect(words.line).not.toBe(sheetWords(state).line);
  });
});
