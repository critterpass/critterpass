/**
 * 3b-5 "All caught up": Tokek curled up asleep where the cards were (bob 3400 ms, a drifting "z"),
 * the title, and a line naming what Tokek is watching when there is something (else a general
 * line). Tapping Tokek opens one eye: a wave and a 16 pt jump (420 ms), a toast, then back to sleep
 * after 2.2 s. A new needs-you item replaces this view, which is how it "wakes".
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useLoop } from '@/motion/use-loop';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export const SLEEPER_SIZE = 150;
export const WAKE_MS = 2200;
const JUMP = 16;
const JUMP_MS = 420;

const useStyles = makeStyles((t) => ({
  root: { alignItems: 'center', gap: t.space['12'], paddingVertical: t.space['24'] },
  zee: { position: 'absolute', top: 0, end: -t.space['12'] },
  line: { textAlign: 'center', paddingHorizontal: t.space['24'] },
}));

export interface AllCaughtUpProps {
  /** What Tokek is watching ("the boat vote"), when there is something to watch. */
  readonly watching?: string | null;
}

export function AllCaughtUp({ watching = null }: AllCaughtUpProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const reduced = useReducedImpactMotion();
  const bob = useLoop('bob');
  const drift = useLoop('float');
  const [awake, setAwake] = useState(false);
  const jump = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!awake || reduced) return;
    jump.value = withSequence(
      withTiming(-JUMP, { duration: JUMP_MS / 2 }),
      withTiming(0, { duration: JUMP_MS / 2 }),
    );
    // The jump plays once each time Tokek wakes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake]);
  const jumpStyle = useAnimatedStyle(() => ({ transform: [{ translateY: jump.value }] }));
  const tokek = GUIDE_STICKERS.tokek;

  const wake = () => {
    setAwake(true);
    toast.show({
      id: 'inbox-tokek-awake',
      title: t({
        id: 'home.inbox.caughtUp.awake',
        message: 'Nothing needs you yet. Back to sleep.',
      }),
    });
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAwake(false), WAKE_MS);
  };

  const line =
    watching === null
      ? t({
          id: 'home.inbox.caughtUp.line',
          message: 'Nothing needs you right now. Tokek will wake you when something does.',
        })
      : t({
          id: 'home.inbox.caughtUp.watching',
          message: `Nothing needs you right now. Tokek will wake you if ${watching} changes.`,
        });

  return (
    <View style={styles.root} testID="inbox-caught-up">
      <Pressable
        testID="inbox-tokek"
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'home.inbox.caughtUp.tokek', message: 'Tokek, asleep' })}
        onPress={wake}
      >
        <Animated.View style={[bob, jumpStyle]}>
          <Sticker
            kind={tokek.kind}
            name={tokek.name}
            size={SLEEPER_SIZE}
            pose={awake ? 'wave' : 'sleep'}
            closedEyes={!awake}
          />
        </Animated.View>
        {awake ? null : (
          <Animated.View style={[styles.zee, drift]} pointerEvents="none">
            <Text variant="voice" color={theme.semantic.text.secondary}>
              {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a snore doodle, not copy. */}
              {'z z'}
            </Text>
          </Animated.View>
        )}
      </Pressable>
      <Text variant="h1" accessibilityRole="header">
        {upper(t({ id: 'home.inbox.caughtUp.title', message: 'All caught up' }), locale)}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary} style={styles.line}>
        {line}
      </Text>
    </View>
  );
}
