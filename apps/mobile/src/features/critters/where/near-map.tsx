/**
 * NEAR ME's map (an undesigned state): every place on the trip where a critter lives, each pin
 * naming the place and the rarest tier still waiting there. Nothing without a trip or its pack.
 */
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { SpotMap } from './spot-map';
import { useNearSpots } from './use-where';
import { allFound, spotsMapLabel } from './where-copy';

const HEIGHT = 240;

export function NearMap({ watching }: { readonly watching: boolean }) {
  const theme = useTheme();
  const locale = useLocale();
  const { spots, trip, position } = useNearSpots(watching);
  if (!watching || spots.length === 0) return null;
  return (
    <Stack gap="8" testID="critters-near-map">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(spotsMapLabel(), locale)}
      </Text>
      <SpotMap
        spots={spots.map((spot) => ({ ...spot, tier: spot.unfound }))}
        position={position}
        slug={trip.slug}
        placeName={trip.name}
        foundLabel={allFound()}
        height={HEIGHT}
      />
    </Stack>
  );
}
