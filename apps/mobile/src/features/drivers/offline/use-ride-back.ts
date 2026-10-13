/**
 * Your ride back's data, shared by both looks: today's set driver from the synced assignments (the
 * day from the synced trip, his number from the last driver read), so it works with no data. Null on
 * a day no driver is set. Call uses the dialer; WhatsApp opens his chat, sent once back online.
 */
import { telLink, whatsappLink } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { useOnline } from '@/data/places/server-name-search';
import { useLocale } from '@/lib/i18n/use-locale';

import { money } from '../shared/format';
import { cachedDrivers, useAssignments } from '../shared/use-drivers';

interface Agreed {
  readonly price_minor?: string | number | null;
  readonly currency?: string | null;
  readonly includes?: Readonly<Record<string, string>>;
}

const parse = <T>(raw: string | null): T | null => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export interface RideBack {
  readonly name: string;
  /** When he picks up ("17:30"), null when the day has no end time. */
  readonly at: string | null;
  /** "Avanza · DK 1234 AB", null without a car on file. */
  readonly vehicle: string | null;
  readonly pickup: string | null;
  /** Price and what it includes, '' when nothing was agreed. */
  readonly terms: string;
  readonly online: boolean;
  readonly onCall: (() => void) | null;
  readonly onWhatsApp: (() => void) | null;
}

export function useRideBack(tripId: string, date: string): RideBack | null {
  const locale = useLocale();
  const { t } = useLingui();
  const online = useOnline();
  const { rows } = useAssignments(tripId);
  const today = rows.find((row) => row.day_date === date);
  if (today === undefined) return null;
  const saved = cachedDrivers(tripId);
  const driver = saved?.drivers.find((d) => d.id === today.provider_id);
  const name = today.name ?? driver?.name ?? '';
  const vehicle = parse<{ model?: string; plate?: string }>(today.vehicle);
  const agreed = parse<Agreed>(today.agreed);
  const phone = driver?.phone ?? null;
  const price =
    agreed?.price_minor == null
      ? null
      : money(Number(agreed.price_minor), agreed.currency ?? null, locale);
  const included = Object.entries(agreed?.includes ?? {})
    .filter(([, value]) => value === 'yes')
    .map(([key]) => key)
    .join(', ');
  const terms = [
    price,
    included === '' ? null : t({ id: 'drivers.offline.included', message: `${included} included` }),
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
  const wa = phone === null ? null : whatsappLink(phone, '');
  return {
    name,
    at: today.window_end,
    vehicle: vehicle === null ? null : [vehicle.model, vehicle.plate].filter(Boolean).join(' · '),
    pickup: today.pickup,
    terms,
    online,
    onCall: phone === null ? null : () => void Linking.openURL(telLink(phone)),
    onWhatsApp: wa === null ? null : () => void Linking.openURL(wa),
  };
}
