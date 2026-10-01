import { I18n } from '@lingui/core';
import type { Messages } from '@lingui/core';
import { compileMessage } from '@lingui/message-utils/compileMessage';

import type { CatalogRegistry } from '../load-catalog';
import { loadCatalog } from '../load-catalog';

/**
 * Renders push/email/SMS copy in a recipient's locale (design-system.md §6 "Server"). Returns a
 * fresh `I18n` instance per call rather than activating the shared `@lingui/core` singleton: the
 * server renders many recipients' locales concurrently, and the singleton has exactly one active
 * locale at a time, so sharing it here would let concurrent requests corrupt each other's output.
 *
 * Catalog messages arrive compiled. A message missing from the catalogs (a template not yet
 * extracted, or a locale without a translation) falls back to its source text, which Lingui only
 * interpolates when a compiler is set: without one, a production build renders `{guide}` literally.
 */
export async function createServerI18n(
  locale: string,
  areas: readonly string[],
  registry?: CatalogRegistry,
): Promise<I18n> {
  const catalogs = await Promise.all(areas.map((area) => loadCatalog(locale, area, registry)));
  const messages = catalogs.reduce<Messages>((merged, catalog) => ({ ...merged, ...catalog }), {});
  const i18n = new I18n({ locale, messages: { [locale]: messages } });
  i18n.setMessagesCompiler(compileMessage);
  return i18n;
}
