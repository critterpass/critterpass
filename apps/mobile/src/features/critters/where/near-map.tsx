/**
 * NEAR ME's map (undesigned; the premium spot map): every place on the trip where a critter lives,
 * each pin's dot in the rarest tier still waiting there, a found-everything place saying so.
 * Nothing without a trip or its spots.
 */
import { View } from 'react-native';

import { Text } from '@/ui/premium';

import { PremiumSpotMap } from '../premium/where/spot-map';
import { useNearSpots } from './use-where';
import { allFound, spotsMapLabel } from './where-copy';

const HEIGHT = 240;

export function NearMap({ watching }: { readonly watching: boolean }) {
  const { spots, trip, position } = useNearSpots(watching);
  if (!watching || spots.length === 0) return null;
  const label = spotsMapLabel();
  return (
    <View style={{ gap: 8 }} testID="critters-near-map">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <PremiumSpotMap
        spots={spots}
        rarity="common"
        position={position}
        slug={trip.slug}
        height={HEIGHT}
        label={label}
        foundLabel={allFound()}
      />
    </View>
  );
}
