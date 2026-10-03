/** Where to find one form, from synced rows and the phone's last position. */
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';

import { directionsUrl } from '../quests/befriend-spot';
import { critterRoute } from '../routes';
import { useWhere } from './use-where';
import { WhereView } from './where-view';

export function WhereScreen({ formId }: { readonly formId: string }) {
  const locale = useLocale();
  const data = useWhere(formId);
  const where = data.where;
  // A form already found has its own page: where it was found, not where to look.
  const critterId = data.critterId;
  useEffect(() => {
    if (data.found && critterId !== null) router.replace(critterRoute(critterId));
  }, [data.found, critterId]);
  const nearest = where?.nearest ?? null;
  const away =
    nearest?.distanceM == null ? null : format.distance(locale, nearest.distanceM, data.unit);
  return (
    <WhereView
      where={where}
      tier={where?.rarity ?? 'common'}
      requirement={data.requirement}
      critter={data.critter}
      slug={data.trip.slug}
      position={data.position}
      away={away}
      onDirections={() => {
        if (nearest !== null) void Linking.openURL(directionsUrl(nearest)).catch(() => false);
      }}
    />
  );
}
