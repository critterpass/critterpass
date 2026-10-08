/** Where to find one form, from synced rows and the phone's last position. */
import { format, upper } from '@cp/i18n';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { backLabel, loadingCritter, mapsFailed } from '../critters-copy';

import { directionsUrl } from '../quests/befriend-spot';
import { critterRoute, PASS_TAB } from '../routes';
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
  const back = upper(backLabel(), locale);
  if (!data.loaded) {
    return (
      <ScreenLoading
        backLabel={back}
        fallback={PASS_TAB}
        label={loadingCritter()}
        testID="critters-where-loading"
      />
    );
  }
  // No such form on this phone: say so, rather than "no places yet" for a critter that isn't one.
  if (data.critter === null) {
    return <ScreenMissing backLabel={back} fallback={PASS_TAB} testID="critters-where-missing" />;
  }
  return (
    <WhereView
      where={where}
      tier={where?.rarity ?? 'common'}
      requirement={data.requirement}
      critter={data.critter}
      slug={data.trip.slug}
      placeName={data.trip.name}
      position={data.position}
      away={away}
      onDirections={() => {
        if (nearest === null) return;
        void Linking.openURL(directionsUrl(nearest)).catch(() =>
          toast.show({ id: 'critters-maps-failed', title: mapsFailed() }),
        );
      }}
    />
  );
}
