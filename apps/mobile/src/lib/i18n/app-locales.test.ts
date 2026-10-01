import { APP_LOCALES, SOURCE_APP_LOCALE } from '@cp/domain';
// eslint-disable-next-line boundaries/dependencies -- the registry lookup only, as in ./set-locale.ts
import { shippedLocaleCodes, sourceLocale } from '@cp/i18n';
import { describe, expect, it } from '@jest/globals';

/**
 * The server keeps its own copy of the shipped languages (`set_app_locale` accepts them,
 * `app.user_locale()` resolves to them). A language shipped here that the server does not know
 * would be reported and rejected, and its speakers would read the guide in English.
 */
describe('the languages the server accepts', () => {
  it('are exactly the ones the app ships', () => {
    expect([...APP_LOCALES].sort()).toEqual([...shippedLocaleCodes].sort());
    expect(SOURCE_APP_LOCALE).toBe(sourceLocale);
  });
});
