/**
 * IF YOU LIKE THIS (7e-2): the same idea somewhere else in the destination, at least twenty
 * minutes away; a row opens the place, + adds it (Add to plan once that screen is in the app).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { AddButton, PlaceRow } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon, categoryLabel } from '../category';
import type { PlaceRef } from './context';

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['14'],
  },
  divider: { borderTopWidth: 1, borderTopColor: t.color.divider },
}));

export function IfYouLike({
  places,
  onPlace,
  onAdd,
}: {
  readonly places: readonly PlaceRef[];
  readonly onPlace: (poiId: string) => void;
  /** Absent while Add to plan is not in the app. */
  readonly onAdd?: ((poiId: string) => void) | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  if (places.length === 0) return null;
  return (
    <View style={{ gap: theme.space['8'] }} testID="place-detail-similar">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'explore.detail.similar', message: 'If you like this' }), i18n.locale)}
      </Text>
      <View style={styles.card}>
        {places.map((place, index) => {
          const kind = categoryLabel(place.category);
          const minutes = String(place.minutes);
          return (
            <View key={place.poi_id} style={index === 0 ? null : styles.divider}>
              <PlaceRow
                title={upper(place.name, i18n.locale)}
                meta={t({ id: 'explore.detail.similarMeta', message: `${kind} · ${minutes} min` })}
                icon={categoryIcon(place.category)}
                onPress={() => onPlace(place.poi_id)}
                trailing={
                  onAdd === undefined ? undefined : (
                    <AddButton
                      accessibilityLabel={t({
                        id: 'explore.detail.similarAdd',
                        message: `Add ${place.name} to the plan`,
                      })}
                      onPress={() => onAdd(place.poi_id)}
                      testID={`place-detail-similar-add-${place.poi_id}`}
                    />
                  )
                }
                testID={`place-detail-similar-${place.poi_id}`}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
