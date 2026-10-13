/**
 * Where to find a form, in the premium look (undesigned; built from the critter page's parts and
 * the premium map): a pushed page with the tier and the form's silhouette (never its name until
 * found), what it takes, its places on the map with the nearest named, the steps that meet it, and
 * Directions to the nearest place in the phone's maps app. A form already found opens its own page.
 */
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Card, Text, tierWord, usePremiumTheme, useToast } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { artKind } from '../../art-kind';
import { backLabel, loadingCritter, mapsFailed } from '../../critters-copy';
import { directionsUrl } from '../../quests/befriend-spot';
import { critterRoute } from '../../routes';
import { useWhere } from '../../where/use-where';
import {
  directions,
  nearestSpot,
  noSpots,
  spotsMapLabel,
  stepsLabel,
  stepText,
  whereEyebrow,
  whereTitle,
} from '../../where/where-copy';
import { CritterSilhouette } from '../components/critter-silhouette';
import { CrittersPageLoading, CrittersPageMissing } from '../components/page-states';
import { tierInk } from '../components/tier';
import { PremiumSpotMap } from './spot-map';

const ART = 88;
const MAP_HEIGHT = 280;

export function PremiumWhereScreen({ formId }: { readonly formId: string }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const data = useWhere(formId);
  const toast = useToast();
  const where = data.where;
  const critterId = data.critterId;
  useEffect(() => {
    if (data.found && critterId !== null) router.replace(critterRoute(critterId));
  }, [data.found, critterId]);
  const title = whereTitle();
  if (!data.loaded) {
    return (
      <CrittersPageLoading title={title} label={loadingCritter()} testID="critters-where-loading" />
    );
  }
  if (data.critter === null) {
    return <CrittersPageMissing title={title} testID="critters-where-missing" />;
  }
  const rarity = where?.rarity ?? 'common';
  const nearest = where?.nearest ?? null;
  const away =
    nearest?.distanceM == null ? null : format.distance(locale, nearest.distanceM, data.unit);
  const silhouette = (size: number) =>
    data.critter === null ? null : (
      <CritterSilhouette
        kind={artKind(data.critter.key)}
        label={data.critter.city}
        size={size}
        seed={data.critter.seed}
        rarity={rarity}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <PushScreen title={title} backLabel={backLabel()} testID="critters-where">
        <View style={{ paddingHorizontal: th.space.gutter, paddingTop: 8, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {silhouette(ART)}
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="tier" color={tierInk(th, rarity)}>
                {whereEyebrow(tierWord(rarity)).toLocaleUpperCase(locale)}
              </Text>
              {data.requirement === null ? null : (
                <Text variant="rowText" singleLine={false} testID="critters-where-requirement">
                  {data.requirement}
                </Text>
              )}
            </View>
          </View>
          {where === null || where.spots.length === 0 ? (
            <Card padded style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <View testID="critters-where-none">{silhouette(112)}</View>
              <Text variant="rowText" tone="muted" align="center" singleLine={false}>
                {noSpots()}
              </Text>
            </Card>
          ) : (
            <View style={{ gap: 10 }}>
              <PremiumSpotMap
                spots={where.spots}
                rarity={rarity}
                position={data.position}
                slug={data.trip.slug}
                height={MAP_HEIGHT}
                label={spotsMapLabel()}
                testID="critters-where-map"
              />
              {nearest === null ? null : (
                <Text variant="rowText" singleLine={false} testID="critters-where-nearest">
                  {nearestSpot(nearest.name, away)}
                </Text>
              )}
            </View>
          )}
          {where === null || where.steps.length === 0 ? null : (
            <Card padded style={{ gap: 10 }} testID="critters-where-steps">
              <Text variant="tier" tone="muted">
                {stepsLabel().toLocaleUpperCase(locale)}
              </Text>
              {where.steps.map((step, index) => (
                <View key={step.kind} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text variant="rowTitle" tone="placeholder" style={{ width: 18 }}>
                    {String(index + 1)}
                  </Text>
                  <Text variant="rowText" singleLine={false} style={{ flex: 1 }}>
                    {stepText(step, nearest?.name ?? null)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
          {nearest === null ? null : <View style={{ height: 72 }} />}
        </View>
      </PushScreen>
      {nearest === null ? null : (
        <View
          style={{
            position: 'absolute',
            left: th.space.gutter,
            right: th.space.gutter,
            bottom: insets.bottom + 12,
          }}
        >
          <Button
            icon="pin"
            label={directions()}
            onPress={() =>
              void Linking.openURL(directionsUrl(nearest)).catch(() =>
                toast.show({ kind: 'error', message: mapsFailed() }),
              )
            }
            testID="critters-where-directions"
          />
        </View>
      )}
    </View>
  );
}
