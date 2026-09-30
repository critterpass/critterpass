/**
 * One must-do in the list (3c-7): its owner (both avatars when two people picked the same place),
 * the title, the place or the guide's note, and a green check for a plain fit or a pill. A row
 * still in this phone's queue is dashed until the server has it. New rows pop in (scale
 * .96 → 1.03 → 1, 420 ms); a row that turns into a clash shakes once with a warning haptic.
 * Tapping your own row, or a lottery, opens its actions (remove, lottery reminders).
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { feedback } from '@/motion';
import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { FitPill } from './fit-pill';
import type { MustDoItem } from './model';

const POP_MS = 420;
const SHAKE_PT = 6;
const ease = bezierEasing(tokens.motion.easing.standard);

/** Dashed → solid pop for a row that arrives while the list is on screen (.96 → 1.03 → 1). */
function usePopIn(arriving: boolean) {
  const scale = useSharedValue(arriving ? 0.96 : 1);
  const opacity = useSharedValue(arriving ? 0 : 1);
  const reduced = useReducedImpactMotion();
  useEffect(() => {
    if (!arriving) return;
    if (reduced) {
      scale.value = 1;
      opacity.value = withTiming(1, { duration: tokens.motion.duration.fast, easing: ease });
      return;
    }
    const up = { duration: POP_MS * 0.6, easing: ease };
    scale.value = withSequence(
      withTiming(1.03, up),
      withTiming(1, { duration: POP_MS * 0.4, easing: ease }),
    );
    opacity.value = withTiming(1, up);
  }, [arriving, reduced, scale, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
}

const useStyles = makeStyles((th) => ({
  card: {
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
    gap: th.space['8'],
  },
  pending: {
    backgroundColor: 'transparent',
    borderWidth: th.space['2'] / 2,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  row: { gap: th.space['12'] },
  body: { flex: 1, gap: th.space['2'] },
  actions: { gap: th.space['8'], flexWrap: 'wrap' },
}));

export interface MustDoRowProps {
  readonly item: MustDoItem;
  readonly onRemove?: (() => void) | undefined;
  readonly onRemind?: (() => void) | undefined;
  /** The row arrived while the list was on screen: it pops in. */
  readonly arriving?: boolean;
}

function useClashShake(clash: boolean) {
  const x = useSharedValue(0);
  const was = useRef(clash);
  const reduced = useReducedImpactMotion();
  useEffect(() => {
    if (clash && !was.current) {
      feedback.emit('warning');
      if (!reduced) {
        const leg = { duration: tokens.motion.duration.fast / 2, easing: ease };
        x.value = withSequence(
          withTiming(-SHAKE_PT, leg),
          withTiming(SHAKE_PT, leg),
          withTiming(-SHAKE_PT / 2, leg),
          withTiming(0, leg),
        );
      }
    }
    was.current = clash;
  }, [clash, reduced, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

export function MustDoRow({ item, onRemove, onRemind, arriving = false }: MustDoRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const shake = useClashShake(item.fit === 'clash');
  const pop = usePopIn(arriving);
  const owners = item.owners.map((owner) => ({
    key: owner.uid,
    name: owner.name,
    joinIndex: owner.joinIndex,
  }));
  const plainFit = item.pill?.kind === 'fits' && item.pill.day === null;
  const actionable = onRemove !== undefined || onRemind !== undefined;
  const who = item.owners.map((owner) => owner.name).join(', ');
  const spoken = [
    item.title,
    item.sub,
    who,
    item.pending ? t({ id: 'setup.mustDos.row.pendingA11y', message: 'Waiting to send' }) : null,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');
  const face = (
    <Row align="center" style={styles.row}>
      <AvatarStack members={owners} size="sm" max={2} accessibilityLabel={who} />
      <View style={styles.body}>
        <Text variant="title">{item.title}</Text>
        {item.sub === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {item.sub}
          </Text>
        )}
        {item.pending ? (
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({ id: 'setup.mustDos.row.pending', message: 'Sends when you’re back online' })}
          </Text>
        ) : null}
      </View>
      {plainFit ? (
        <Icon name="check" size={20} color={theme.semantic.state.success} decorative />
      ) : item.pill === null ? null : (
        <FitPill pill={item.pill} testID={`must-do-pill-${item.id}`} />
      )}
    </Row>
  );
  return (
    <Animated.View
      style={[styles.card, item.pending ? styles.pending : null, pop, shake]}
      testID={`must-do-${item.id}`}
    >
      {actionable ? (
        <PressScale
          onPress={() => setOpen((value) => !value)}
          accessibilityLabel={spoken}
          accessibilityState={{ expanded: open }}
        >
          {face}
        </PressScale>
      ) : (
        <View accessible accessibilityLabel={spoken}>
          {face}
        </View>
      )}
      {open ? (
        <Row style={styles.actions}>
          {onRemind === undefined ? null : (
            <InlineAction
              label={t({ id: 'setup.mustDos.row.remind', message: 'Remind me to enter' })}
              onPress={onRemind}
              kind="approve"
              testID={`must-do-remind-${item.id}`}
            />
          )}
          {onRemove === undefined ? null : (
            <InlineAction
              label={t({ id: 'setup.mustDos.row.remove', message: 'Remove' })}
              onPress={onRemove}
              kind="ghost"
              testID={`must-do-remove-${item.id}`}
            />
          )}
        </Row>
      ) : null}
    </Animated.View>
  );
}
