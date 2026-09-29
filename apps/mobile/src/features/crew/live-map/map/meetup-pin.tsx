/**
 * The meet-up: a yellow star pin "{place} / MEET {HH:mm}" with the trip's guide hopping beside it.
 * Once every sharing member is under five minutes away the pin pulses (the ping preset); reduced
 * motion shows the rings still.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePingRings } from '@/motion/patterns/ping-rings';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Row, Stack, Text } from '@/ui';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  wrap: { alignItems: 'flex-end', flexDirection: 'row', gap: th.space['6'] },
  pin: {
    alignItems: 'center',
    gap: th.space['8'],
    backgroundColor: tokens.color.yellow,
    borderColor: th.semantic.bg.sunken,
    borderWidth: 3,
    borderRadius: th.radius.md,
    paddingVertical: th.space['6'],
    paddingLeft: th.space['6'],
    paddingRight: th.space['12'],
    maxWidth: 220,
  },
  star: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: th.semantic.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    left: -8,
    right: -8,
    top: -8,
    bottom: -8,
    borderRadius: th.radius.lg,
    borderWidth: 3,
    borderColor: tokens.color.yellow,
  },
  names: { flexShrink: 1 },
}));

export function MeetupPin({
  place,
  time,
  pulse,
  pending,
  onPress,
}: {
  readonly place: string;
  readonly time: string;
  readonly pulse: boolean;
  readonly pending: boolean;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const rings = usePingRings(pulse);
  const hop = useLoop('hop');
  const guide = GUIDE_STICKERS.tokek;
  return (
    <View style={styles.wrap}>
      <Animated.View style={hop}>
        <Sticker kind={guide.kind} name={guide.name} size={44} />
      </Animated.View>
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'liveMap.meetup.pinLabel',
          message: `Meet-up at ${place}, ${time}`,
        })}
        testID="live-meetup-pin"
      >
        {pulse
          ? rings.map((ring) => <Animated.View key={ring.key} style={[styles.ring, ring.style]} />)
          : null}
        <Row style={[styles.pin, pending ? { opacity: 0.7 } : null]}>
          <View style={styles.star}>
            <Icon name="star" size={16} decorative color={tokens.color.yellow} />
          </View>
          <Stack gap="2" style={styles.names}>
            <Text
              variant="label"
              color={tokens.color.ink[850]}
              numberOfLines={1}
              style={{ textTransform: 'uppercase' }}
            >
              {place}
            </Text>
            <Text variant="caption" color={tokens.color.ink[850]} numberOfLines={1}>
              {t({ id: 'liveMap.meetup.pinTime', message: `MEET ${time}` })}
            </Text>
          </Stack>
        </Row>
      </PressScale>
    </View>
  );
}
