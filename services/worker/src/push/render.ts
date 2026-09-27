/**
 * Server-side rendering of notification copy in the recipient's locale (docs/design-system.md §6
 * "Server"): each template is a Lingui message descriptor (`{id, message}`, marked for extraction) in
 * the `notifications/*` catalogs, rendered with a per-locale `I18n` instance (never the shared
 * singleton, so concurrent recipients cannot bleed into each other). Only shipped locales are used;
 * anything else reads in the source language.
 */
import { shippedLocaleCodes, sourceLocale, type CatalogRegistry } from '@cp/i18n';
import { createServerI18n } from '@cp/i18n/server';
import type { I18n } from '@lingui/core';

/** A template: the catalog id plus the source-language message it was extracted with. */
export interface Copy {
  readonly id: string;
  readonly message: string;
}

export type CopyVars = Readonly<Record<string, string | number>>;

export const NOTIFICATION_CATALOGS = ['notifications/common', 'notifications/roundup'] as const;

/** The catalog locale for a device/user locale tag (`vi-VN` → `vi`, `zh-Hans-SG` → `zh-Hans`). */
export function resolveCatalogLocale(tag: string | null | undefined): string {
  if (!tag) return sourceLocale;
  const normalised = tag.replace('_', '-');
  const candidates = [
    normalised,
    normalised.split('-').slice(0, 2).join('-'),
    normalised.split('-')[0],
  ];
  if (/^zh(-(CN|SG|Hans))?/i.test(normalised)) candidates.push('zh-Hans');
  for (const candidate of candidates) {
    const match = shippedLocaleCodes.find(
      (code) => code.toLowerCase() === candidate?.toLowerCase(),
    );
    if (match !== undefined) return match;
  }
  return sourceLocale;
}

export interface CopyRenderer {
  render(locale: string, copy: Copy, vars?: CopyVars): Promise<string>;
}

/** One cached `I18n` per catalog locale for the life of the process. */
export function createCopyRenderer(registry?: CatalogRegistry): CopyRenderer {
  const instances = new Map<string, Promise<I18n>>();
  const forLocale = (locale: string): Promise<I18n> => {
    let instance = instances.get(locale);
    if (instance === undefined) {
      instance = createServerI18n(locale, NOTIFICATION_CATALOGS, registry);
      instance.catch(() => instances.delete(locale));
      instances.set(locale, instance);
    }
    return instance;
  };
  return {
    async render(locale, copy, vars = {}) {
      const i18n = await forLocale(resolveCatalogLocale(locale));
      return i18n._(copy.id, vars, { message: copy.message });
    },
  };
}
