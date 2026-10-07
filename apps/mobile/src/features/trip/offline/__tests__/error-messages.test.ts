/** A wire error code always reads as words, in every code the contract lists and any it does not. */
import { ERROR_CODES, errorMessageKey } from '@cp/domain';
import { loadCatalog } from '@cp/i18n';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { errorMessage } from '@/lib/errors/error-messages';

const showsWireCode = (text: string) =>
  /[A-Z]{2,}_[A-Z]/.test(text) || ERROR_CODES.some((code) => text.includes(code));
const UNKNOWN_CODES = ['SOMETHING_NEW', '', 'toString', '__proto__', 'not_found'];

describe.each(['en', 'vi'])('error messages in %s', (locale) => {
  beforeAll(async () => {
    i18n.loadAndActivate({ locale, messages: await loadCatalog(locale, 'common') });
  });

  it('has its own words for every code in the wire contract', () => {
    for (const code of ERROR_CODES) {
      const text = i18n._(errorMessage(code));
      expect([code, text.trim().length > 0]).toEqual([code, true]);
      expect([code, showsWireCode(text)]).toEqual([code, false]);
      expect(text).not.toContain('errors.');
    }
  });

  it('resolves the bare catalogue key of every code, so a screen holding only the key reads the same', () => {
    for (const code of ERROR_CODES) {
      expect(i18n._(errorMessageKey(code))).toBe(i18n._(errorMessage(code)));
      expect(errorMessage(code).id).toBe(errorMessageKey(code));
    }
  });

  it('gives a code this build does not know the general line, never the code', () => {
    const general = i18n._(errorMessage('SOMETHING_NEW'));
    expect(showsWireCode(general)).toBe(false);
    expect(general).not.toContain('errors.');
    for (const code of UNKNOWN_CODES) expect(i18n._(errorMessage(code))).toBe(general);
  });
});

describe('error message translations', () => {
  it('words every line in Vietnamese rather than falling back to English', async () => {
    const [en, vi] = await Promise.all([loadCatalog('en', 'common'), loadCatalog('vi', 'common')]);
    for (const key of [...ERROR_CODES.map(errorMessageKey), 'errors.unknown']) {
      expect([key, vi[key] === en[key]]).toEqual([key, false]);
    }
  });
});
