/**
 * PAID BY: one avatar per member as a radio group, with a single shared yellow ring that springs
 * across to the avatar tapped (a cross-fade under reduced motion). Defaults to you.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback, isPhysicalSpring, springConfig } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Avatar } from '@/ui/people/Avatar';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import type { MoneyMember } from '../data/context';

const SPRING = isPhysicalSpring(tokens.motion.spring.bouncy)
  ? springConfig(tokens.motion.spring.bouncy)
  : undefined;

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'center', justifyContent: 'space-between' },
  avatars: { flexDirection: 'row', gap: t.space['8'] },
  ring: {
    position: 'absolute',
    top: -t.space['4'],
    borderWidth: t.space['2'] + 1,
    borderColor: t.semantic.action.primary,
  },
}));

export interface PayerPickerProps {
  readonly members: readonly MoneyMember[];
  readonly payerId: string;
  readonly onPick: (userId: string) => void;
}

export function PayerPicker({ members, payerId, onPick }: PayerPickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const reduced = useReducedImpactMotion();
  const diameter = sizeToken(theme.size.avatar, 'md');
  const gap = theme.space['8'];
  const ringSize = diameter + theme.space['8'];
  const index = Math.max(
    0,
    members.findIndex((member) => member.userId === payerId),
  );
  const x = useSharedValue(index * (diameter + gap));
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const target = index * (diameter + gap);
    x.value = reduced || SPRING === undefined ? target : withSpring(target, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [index, diameter, gap, reduced]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Row style={styles.row}>
      <Text variant="eyebrow">
        {upper(t({ id: 'money.add.paidBy', message: 'Paid by' }), locale)}
      </Text>
      <View
        style={styles.avatars}
        accessibilityRole="radiogroup"
        accessibilityLabel={t({ id: 'money.add.paidBy', message: 'Paid by' })}
        onLayout={() => setMeasured(true)}
      >
        {measured ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                start: -theme.space['4'],
              },
              ringStyle,
            ]}
          />
        ) : null}
        {members.map((member) => (
          <Pressable
            key={member.userId}
            accessibilityRole="radio"
            accessibilityState={{ checked: member.userId === payerId }}
            accessibilityLabel={member.name}
            onPress={() => {
              feedback.emit('tick');
              onPick(member.userId);
            }}
            testID={`money-add-payer-${member.joinIndex}`}
          >
            <Avatar name={member.name} joinIndex={member.joinIndex} size="md" decorative />
          </Pressable>
        ))}
      </View>
    </Row>
  );
}
