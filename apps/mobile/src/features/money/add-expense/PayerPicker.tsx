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
import { makeStyles } from '@/ui/theme';

import type { MoneyMember } from '../data/context';

const SPRING = isPhysicalSpring(tokens.motion.spring.bouncy)
  ? springConfig(tokens.motion.spring.bouncy)
  : undefined;

/** Clear space between the avatar's edge and the ring. */
const RING_GAP = tokens.space['4'];

interface Slot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'center', justifyContent: 'space-between' },
  avatars: { flexDirection: 'row', gap: t.space['8'] },
  ring: {
    position: 'absolute',
    start: 0,
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
  const locale = useLocale();
  const { t } = useLingui();
  const reduced = useReducedImpactMotion();
  // The ring is laid out around the avatar as measured (its drawn size, not the size token), so
  // the two share a centre whatever the avatar adds around its face.
  const [slots, setSlots] = useState<Readonly<Record<string, Slot>>>({});
  const target = slots[payerId];
  const ringSize = target === undefined ? 0 : Math.max(target.width, target.height) + RING_GAP * 2;
  const left = target === undefined ? 0 : target.x + target.width / 2 - ringSize / 2;
  const top = target === undefined ? 0 : target.y + target.height / 2 - ringSize / 2;
  const x = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (target === undefined) return;
    x.value = !placed.value || reduced || SPRING === undefined ? left : withSpring(left, SPRING);
    placed.value = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [left, target === undefined, reduced]);
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
              { width: ringSize, height: ringSize, borderRadius: ringSize / 2, top },
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
              const { x: at, y, width, height } = event.nativeEvent.layout;
              setSlots((current) => {
                const was = current[member.userId];
                return was?.x === at && was.y === y && was.width === width && was.height === height
                  ? current
                  : { ...current, [member.userId]: { x: at, y, width, height } };
              });
            }}
            testID={`money-add-payer-${member.joinIndex}`}
          >
            <Avatar name={member.name} joinIndex={member.joinIndex} size="lg" decorative />
          </Pressable>
        ))}
      </View>
    </Row>
  );
}
