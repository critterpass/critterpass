/**
 * Who is up (3k-2): the item's crew as overlapping avatars. Sleepers sit at 55 % and bob (1800 ms,
 * 600 ms apart); someone waking pops to full size.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useLoop } from '@/motion/use-loop';
import { Avatar } from '@/ui/people/Avatar';
import { Row } from '@/ui/layout/Row';
import { makeStyles } from '@/ui/theme';

import type { ReadinessPerson } from '../leave-by/model';

const SLEEPER_OPACITY = 0.55;
/** 1800 ms bob, each sleeper 600 ms after the one before. */
const SNORE_STAGGER = 600 / 1800;

const useStyles = makeStyles((th) => ({
  face: { marginEnd: -th.space['8'] },
}));

function Face({ person, index }: { readonly person: ReadinessPerson; readonly index: number }) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const bob = useLoop('bob', { offset: index * SNORE_STAGGER, active: !person.up });
  const scale = useSharedValue(1);
  const wasUp = useRef(person.up);
  useEffect(() => {
    if (person.up && !wasUp.current && !reduced) {
      scale.value = withSequence(
        withTiming(1.25, { duration: tokens.motion.duration.instant }),
        withSpring(1),
      );
    }
    wasUp.current = person.up;
  }, [person.up, reduced, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.face, person.up ? pop : bob]}>
      <View style={{ opacity: person.up ? 1 : SLEEPER_OPACITY }}>
        <Avatar name={person.name} joinIndex={person.joinIndex} size="md" decorative />
      </View>
    </Animated.View>
  );
}

export interface ReadinessFacesProps {
  readonly crew: readonly ReadinessPerson[];
}

/** The faces only; the hero reads them out with its "4 of 6 are up" line. */
export function ReadinessFaces({ crew }: ReadinessFacesProps) {
  const sleepers = crew.filter((person) => !person.up).map((person) => person.id);
  return (
    <Row importantForAccessibility="no-hide-descendants" testID="trip-day-readiness">
      {crew.map((person) => (
        <Face key={person.id} person={person} index={Math.max(0, sleepers.indexOf(person.id))} />
      ))}
    </Row>
  );
}
