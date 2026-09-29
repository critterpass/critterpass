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
  const ringSize = diameter + theme.space['8'];
  const [slots, setSlots] = useState<Readonly<Record<string, number>>>({});
  const target = slots[payerId];
  const x = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (target === undefined) return;
    const left = target - theme.space['4'];
    x.value = !placed.value || reduced || SPRING === undefined ? left : withSpring(left, SPRING);
    placed.value = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [target, reduced]);
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
      >
        {target !== undefined ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                start: 0,
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
            onLayout={(event) => {
              const at = event.nativeEvent.layout.x;
              setSlots((current) =>
                current[member.userId] === at ? current : { ...current, [member.userId]: at },
              );
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
