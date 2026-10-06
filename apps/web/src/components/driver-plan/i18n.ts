/* eslint-disable lingui/no-unlocalized-strings -- locale codes, query names and Intl options, not UI copy. */
/**
 * The driver pages speak English or Indonesian, the whole page at once: `?lang=` wins, then the
 * browser's first language, then English. Dates and rupiah follow the page's language.
 */
import { createServerI18n } from '@cp/i18n/server';
import { DRIVER_PLAN_LOCALES, type DriverPlanLocale } from '@cp/domain';
import type { I18n, MessageDescriptor } from '@lingui/core';

const instances = new Map<DriverPlanLocale, Promise<I18n>>();

export function driverPlanLocale(url: URL, acceptLanguage: string | null): DriverPlanLocale {
  const asked = url.searchParams.get('lang');
  if ((DRIVER_PLAN_LOCALES as readonly (string | null)[]).includes(asked)) {
    return asked as DriverPlanLocale;
  }
  const first = acceptLanguage?.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('id') || first.startsWith('in') ? 'id' : 'en';
}

export type Translate = (descriptor: MessageDescriptor, values?: Record<string, unknown>) => string;

export async function driverPlanTranslator(locale: DriverPlanLocale): Promise<Translate> {
  let instance = instances.get(locale);
  if (instance === undefined) {
    instance = createServerI18n(locale, ['driver-plan-web']);
    instances.set(locale, instance);
  }
  const i18n = await instance;
  return (descriptor, values) =>
    i18n._(values === undefined ? descriptor : { ...descriptor, values });
}

const TAG: Readonly<Record<DriverPlanLocale, string>> = { en: 'en-GB', id: 'id-ID' };

/** "Wed 14 Oct" from a plan date (`YYYY-MM-DD`, a calendar day: formatted in UTC). */
export function formatDay(locale: DriverPlanLocale, date: string | null, dayNo: number): string {
  if (date === null) return `#${dayNo}`;
  return new Intl.DateTimeFormat(TAG[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "1 Nov" from an instant. */
export function formatDate(locale: DriverPlanLocale, iso: string): string {
  return new Intl.DateTimeFormat(TAG[locale], { day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

/** "Rp 700.000": rupiah have no minor unit, so the amount is whole rupiah. */
export function formatRupiah(locale: DriverPlanLocale, amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat(TAG[locale], {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
