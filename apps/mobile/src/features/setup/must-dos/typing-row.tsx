/**
 * The dashed "{name} is typing" row (3c-7): a crewmate has the add sheet open and is typing. Three
 * dots bounce (ty 0 → −4 → 0, 1200 ms, 160 ms stagger); they rest when motion is reduced.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Row } from '@/ui/layout/Row';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SetupMember } from '../data/setup-trip';

const DOT = 5;

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.md,
    borderWidth: th.space['2'] / 2,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
    gap: th.space['12'],
  },
  name: { flex: 1 },
  dots: { gap: th.space['4'], alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
}));

function Dot({ index }: { readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const bounce = patterns.useTypingDot(!reduced, index);
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: theme.semantic.text.secondary }, bounce]}
    />
  );
}

export function TypingRow({ member }: { readonly member: SetupMember }) {
  const styles = useStyles();
  const theme = useTheme();
  const name = member.name;
  const line = t({ id: 'setup.mustDos.typing', message: `${name} is typing` });
  return (
    <View
      accessible
      accessibilityLabel={line}
      accessibilityLiveRegion="polite"
      testID={`must-do-typing-${member.uid}`}
    >
      <Row align="center" style={styles.card}>
        <Avatar name={member.name} joinIndex={member.joinIndex} size="sm" decorative />
        <Text variant="body" color={theme.semantic.text.secondary} style={styles.name}>
          {line}
        </Text>
        <Row style={styles.dots}>
          {[0, 1, 2].map((index) => (
            <Dot key={index} index={index} />
          ))}
        </Row>
      </Row>
    </View>
  );
}
