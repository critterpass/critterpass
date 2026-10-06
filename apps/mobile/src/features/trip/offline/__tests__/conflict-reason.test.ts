/** A rejected offline change reads as a reason in words, whatever code the server answered with. */
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@cp/domain';
import { i18n } from '@lingui/core';

import { conflictReason } from '../conflict-reason';

const read = (code: string) => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return i18n._(conflictReason(code));
};

describe('why an offline change did not go through', () => {
  it('gives the codes a traveller can act on their own words', () => {
    expect(read('NOT_FOUND')).toBe('It was removed while you were offline');
    expect(read('VERSION_CONFLICT')).toBe('Someone changed it first');
    expect(read('FORBIDDEN')).toBe('You can no longer change this');
    expect(read('VOTE_CLOSED')).toBe('The vote closed while you were offline');
  });

  it('falls back to the general reason for any other code, known or not', () => {
    const general = "It couldn't be saved. Try it again";
    expect(read('INTERNAL')).toBe(general);
    expect(read('SOMETHING_NEW')).toBe(general);
    expect(read('toString')).toBe(general);
  });

  it('never shows a wire code', () => {
    for (const code of ERROR_CODES) expect(read(code)).not.toContain(code);
  });
});
