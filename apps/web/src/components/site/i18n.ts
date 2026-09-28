/**
 * The site's copy, rendered through the `web` Lingui catalog (packages/i18n/locales/<locale>/web).
 * Messages are authored as `/*i18n*\/` descriptors next to the components that use them, extracted
 * with `pnpm --filter @cp/i18n extract` and compiled with `pnpm --filter @cp/i18n compile`. One
 * I18n instance per locale, created on first use and reused by every page of the build or Worker.
 */
import type { I18n, MessageDescriptor } from '@lingui/core';
import { createServerI18n } from '@cp/i18n/server';

export const SITE_LOCALE = 'en';

const instances = new Map<string, Promise<I18n>>();

export function siteI18n(locale: string = SITE_LOCALE): Promise<I18n> {
  let instance = instances.get(locale);
  if (instance === undefined) {
    instance = createServerI18n(locale, ['web']);
    instances.set(locale, instance);
  }
  return instance;
}

/** A translator bound to one locale: `t(copy.header.tips)` or `t(copy.x, { name })`. */
export type Translate = (descriptor: MessageDescriptor, values?: Record<string, unknown>) => string;

export async function siteTranslator(locale: string = SITE_LOCALE): Promise<Translate> {
  const i18n = await siteI18n(locale);
  return (descriptor, values) =>
    i18n._(values === undefined ? descriptor : { ...descriptor, values });
}
