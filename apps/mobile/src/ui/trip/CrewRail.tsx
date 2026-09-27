import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface RailMember {
  readonly id: string;
  readonly name: string;
  readonly avatar: ReactNode;
  /** How far along to the meet-up, 0 (just left) to 1 (arrived). */
  readonly progress: number;
  /** "8 min", "Here". */
  readonly etaLabel: string;
}

export interface CrewRailProps {
  readonly members: readonly RailMember[];
  /** Meet-up place at the flag ("Campuhan Ridge"). */
  readonly destination: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  rail: { height: sizeToken(th.size.avatar, 'lg') + th.space['8'], justifyContent: 'center' },
  line: {
    height: th.space['2'],
    backgroundColor: th.semantic.border.decorative,
    marginEnd: th.space['24'],
  },
  flag: { position: 'absolute', end: 0 },
  pin: { position: 'absolute', top: th.space['4'] },
}));

function RailPin({ member, width }: { readonly member: RailMember; readonly width: number }) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const x = useSharedValue(0);
  const target = Math.min(1, Math.max(0, member.progress)) * width;
  useEffect(() => {
    x.value = reduced ? target : withTiming(target, { duration: tokens.motion.duration.slow });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [target, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[styles.pin, style]}>{member.avatar}</Animated.View>;
}

/** The crew on one line sliding toward the meet-up flag; reads as each person's ETA. */
export function CrewRail({ members, destination, testID }: CrewRailProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const travel = Math.max(0, width - sizeToken(theme.size.avatar, 'lg') - theme.space['24']);
  const spoken = [
    destination,
    ...members.map((member) => `${member.name}, ${member.etaLabel}`),
  ].join('; ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={spoken}
      style={styles.rail}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View style={styles.line} />
      <Row style={styles.flag} importantForAccessibility="no-hide-descendants">
        <Text variant="h3">⚑</Text>
      </Row>
      {members.map((member) => (
        <RailPin key={member.id} member={member} width={travel} />
      ))}
    </View>
  );
}
