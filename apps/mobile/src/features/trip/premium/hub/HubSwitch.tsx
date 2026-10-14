/**
 * Today / Plan / Map / Money under the hub's hero (1.05). Today is the hub itself; the other three
 * open their own pages over it (the plan, the crew map, the trip's money), so back returns here.
 * A door with nowhere to go yet (no plan while the crew votes) is left out, never drawn dead.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import {
  PressableScale,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

export interface HubDoor {
  readonly key: 'plan' | 'map' | 'money';
  readonly onPress: () => void;
}

function Chip(props: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress?: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      {...(props.onPress === undefined ? {} : { onPress: props.onPress })}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={props.label}
      testID={props.testID}
    >
      <View
        style={[
          styles.chip,
          {
            borderRadius: th.radius.pillSmall,
            paddingHorizontal: th.space.pillSmallPadH + 2,
            backgroundColor: props.selected ? th.color.ink : th.color.card,
            // The 56 pt pill's deep ink shadow is never for a chip: both lie on the float shadow.
            boxShadow: th.shadow.float,
          },
        ]}
      >
        <Text variant="pillSmall" color={props.selected ? th.color.onInk : th.color.ink}>
          {props.label}
        </Text>
      </View>
    </PressableScale>
  );
}

export function HubSwitch({ doors }: { readonly doors: readonly HubDoor[] }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const labels: Record<HubDoor['key'], string> = {
    plan: t({ id: 'trip.hub.door.plan', message: 'Plan' }),
    map: t({ id: 'trip.hub.door.map', message: 'Map' }),
    money: t({ id: 'trip.hub.door.money', message: 'Money' }),
  };
  return (
    // Scrolls only when the chips overflow (a longer language): a row that fits doesn't bounce, so
    // an iOS edge swipe that starts over it goes back instead of tugging the chips.
    <ScrollRow
      accessibilityRole="tablist"
      gap={th.space.gap8}
      contentContainerStyle={{ paddingHorizontal: th.space.gap16 }}
      style={styles.scroller}
      testID="trip-hub-switch"
    >
      <Chip
        label={t({ id: 'trip.hub.door.today', message: 'Today' })}
        selected
        testID="trip-hub-door-today"
      />
      {doors.map((door) => (
        <Chip
          key={door.key}
          label={labels[door.key]}
          selected={false}
          onPress={door.onPress}
          testID={`trip-hub-door-${door.key}`}
        />
      ))}
    </ScrollRow>
  );
}

const styles = StyleSheet.create({
  // The row keeps the 4 pt it always added between the hero and the chips.
  scroller: { marginVertical: 4 - ROW_ROOM_BELOW, marginTop: 4 - ROW_ROOM_ABOVE },
  chip: { height: 34, justifyContent: 'center' },
});
