/**
 * The rest of what the deletion preflight says, under the owed rows: what you owe each crew (it
 * stays on their balances), who takes over the trips you organise, and the trip you are on right
 * now. Undesigned in the premium set: muted note lines in the page's column.
 */
import type { DeletionPreflight } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text, usePremiumTheme } from '@/ui/premium';

import { amountText } from '../../account/amount-text';

/* eslint-disable lingui/no-unlocalized-strings -- React list keys, never copy. */
const oweKey = (b: DeletionPreflight['balances'][number]) => `owe-${b.crew_id}-${b.currency}`;
const tripKey = (id: string) => `trip-${id}`;
/* eslint-enable lingui/no-unlocalized-strings */

export function PreflightNotes({ preflight }: { readonly preflight: DeletionPreflight }) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const lines: { key: string; text: string }[] = [];
  for (const b of preflight.balances) {
    if (b.net_minor >= 0) continue;
    const amount = amountText(-b.net_minor, b.currency, locale);
    const crew = b.crew_name;
    lines.push({
      key: oweKey(b),
      text: t({
        id: 'you.delete.owe',
        message: `You owe ${crew} ${amount}. It stays on the crew’s balances under “former member”.`,
      }),
    });
  }
  for (const trip of preflight.organised_trips) {
    const name = trip.trip_name ?? t({ id: 'you.delete.tripFallback', message: 'your trip' });
    const next = trip.transfer_to_name;
    const text = trip.sole_member
      ? t({
          id: 'you.delete.tripAlone',
          message: `Nobody else is on ${name}, so it closes with you.`,
        })
      : next !== null
        ? t({ id: 'you.delete.tripHandOver', message: `${next} takes over organising ${name}.` })
        : t({ id: 'you.delete.tripCoOrganiser', message: `${name} keeps its other organiser.` });
    lines.push({ key: tripKey(trip.trip_id), text });
  }
  if (preflight.active_trip !== null) {
    const name =
      preflight.active_trip.trip_name ?? t({ id: 'you.delete.tripFallback', message: 'your trip' });
    lines.push({
      key: 'active',
      text: t({
        id: 'you.delete.activeTrip',
        message: `You’re on ${name} right now. The crew loses your plans, pings and location at once.`,
      }),
    });
  }
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: th.space.gap8 }} testID="you-delete-preflight-lines">
      {lines.map((line) => (
        <Text key={line.key} variant="note" tone="muted">
          {line.text}
        </Text>
      ))}
    </View>
  );
}
