/**
 * What a tap on a pin leads to on the trip map (undesigned; the place card of the places map,
 * built from the sheet's own pieces): the picked stop or place at the head of the peek sheet with
 * the one thing to do with it, so a tap on the map never ends at a label.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { MapPlace } from './map-places';
import type { PickedStop } from './trip-map-layers';

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    padding: t.space['12'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
  },
  text: { flex: 1, minWidth: 0, gap: t.space['2'] },
}));

export interface PickedCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly action: string;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}

export function PickedCard({
  title,
  subtitle,
  action,
  onPress,
  testID = 'trip-map-picked',
}: PickedCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.text}>
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <PillButton size="sm" label={action} onPress={onPress} testID={`${testID}-open`} />
    </View>
  );
}

/** The picked stop (OPEN: its sheet) or place (SEE PLACE: its page) as the peek sheet's head. */
export function PickedHead({
  stop,
  place,
  onPress,
}: {
  readonly stop: PickedStop | null;
  readonly place: MapPlace | null;
  readonly onPress: () => void;
}) {
  const { t } = useLingui();
  if (stop !== null) {
    return (
      <PickedCard
        title={stop.title}
        subtitle={stop.subtitle}
        action={t({ id: 'plan.tripMap.openStop', message: 'Open' })}
        onPress={onPress}
      />
    );
  }
  if (place === null) return null;
  return (
    <PickedCard
      title={place.name}
      subtitle={
        place.tier === 'saved'
          ? t({ id: 'plan.tripMap.label.saved', message: 'Saved by the crew' })
          : t({ id: 'plan.tripMap.label.pick', message: 'A pick for this trip' })
      }
      action={t({ id: 'plan.tripMap.openPlace', message: 'See place' })}
      onPress={onPress}
    />
  );
}
