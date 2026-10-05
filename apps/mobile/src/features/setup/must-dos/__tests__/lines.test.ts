/** The guide's line under the must-dos: a check that found nothing to say still ends. */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { summaryLine } from '../lines';
import type { MustDoItem } from '../model';

function item(overrides: Partial<MustDoItem>): MustDoItem {
  return {
    id: 'm1',
    title: 'Bánh căn in the morning',
    sub: null,
    owners: [],
    fit: 'unknown',
    checked: false,
    pill: null,
    poiId: null,
    pending: false,
    mine: true,
    primary: true,
    ...overrides,
  };
}

const CHECKING = 'Checking them against the dates.';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('the must-dos summary line', () => {
  it('says it is checking only while a must-do has not been looked at', () => {
    expect(summaryLine([item({})], 0)).toBe(CHECKING);
    expect(summaryLine([item({ pending: true, checked: true })], 0)).toBe(CHECKING);
  });

  it('resolves once the guide has looked, verdict or not', () => {
    expect(summaryLine([item({ checked: true })], 0)).not.toContain(CHECKING);
    expect(summaryLine([item({ fit: 'fits', checked: true })], 0)).toBe('It fits.');
  });

  it('never says checking once the draft has been asked for', () => {
    expect(summaryLine([item({})], 0, true)).not.toContain(CHECKING);
  });

  it('speaks for the rest when only some have a verdict', () => {
    const line = summaryLine(
      [item({ id: 'a', fit: 'fits', checked: true }), item({ id: 'b', checked: true })],
      0,
    );
    expect(line).toContain('1 fit.');
    expect(line).not.toContain(CHECKING);
  });
});
