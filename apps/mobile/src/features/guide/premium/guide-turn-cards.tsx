/**
 * What a guide turn shows while it is not a plain answer: the working card with its steps (5.18),
 * and a failed turn with Try again and Ask it differently (5.17).
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { useFailureLine } from '../chat/components/guide-states';
import { toolStepLabel } from '../chat/data/tool-steps';
import type { TurnStep } from '../chat/data/turn-state';
import { GuideDisc } from './guide-bubbles';

const useStyles = makePremiumStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: th.space.gap8 },
  working: {
    flex: 1,
    marginRight: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: th.space.gap10,
    borderRadius: 22,
    borderBottomLeftRadius: 6,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap10 },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function ActiveDot() {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) return undefined;
    pulse.value = withRepeat(withTiming(0.45, { duration: th.motion.bobMs / 2 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced, th.motion.bobMs]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: th.accent.sun }, style]}
    />
  );
}

/** A slow answer's working card: what the guide is checking, step by step, and Stop. */
export function WorkingCard({
  slug,
  guideName,
  steps,
  onStop,
}: {
  readonly slug: string;
  readonly guideName: string;
  readonly steps: readonly TurnStep[];
  readonly onStop: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const active = steps.findIndex((step) => !step.done);
  return (
    <View style={{ gap: th.space.gap10 }} testID="guide-working">
      <View style={styles.row}>
        <GuideDisc slug={slug} name={guideName} size={34} pose="think" />
        <View style={styles.working}>
          <Text variant="rowTitle">
            {t({ id: 'guide.premium.working', message: 'Working on it' })}
          </Text>
          {steps.map((step, index) => {
            const done = step.done;
            const now = index === active;
            return (
              <View key={step.id} style={styles.step}>
                <View
                  style={[
                    styles.marker,
                    done
                      ? { backgroundColor: th.color.toggleOn }
                      : now
                        ? { borderWidth: 2.5, borderColor: th.accent.sun }
                        : { borderWidth: 1.5, borderColor: th.color.outlineEmpty },
                  ]}
                >
                  {done ? <Icon name="check" size={11} color={th.color.onInk} /> : null}
                  {now ? <ActiveDot /> : null}
                </View>
                <Text
                  variant={now ? 'rowTextStrong' : 'rowText'}
                  tone={done || now ? 'ink' : 'placeholder'}
                >
                  {toolStepLabel(step.tool)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={[styles.pills, { paddingLeft: 42 }]}>
        <PressableScale
          style={styles.pill}
          onPress={onStop}
          accessibilityRole="button"
          testID="guide-stop"
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              backgroundColor: th.color.destructive.text,
            }}
          />
          <Text variant="rowTextStrong" color={th.color.destructive.text}>
            {t({ id: 'guide.premium.stop', message: 'Stop' })}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

/** A turn that failed: the guide's line, Try again when it can, and Ask it differently. */
export function FailedTurn({
  slug,
  guideName,
  code,
  retryable,
  onRetry,
  onRephrase,
}: {
  readonly slug: string;
  readonly guideName: string;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly onRetry: () => void;
  readonly onRephrase: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const line = useFailureLine(code);
  return (
    <View style={styles.row} testID="guide-error">
      <GuideDisc slug={slug} name={guideName} size={28} />
      <View style={{ flex: 1, gap: th.space.gap8 }}>
        <View style={[styles.working, { marginRight: 0, alignSelf: 'flex-start' }]}>
          <Text variant="body">{line}</Text>
        </View>
        <View style={styles.pills}>
          {retryable ? (
            <PressableScale
              style={styles.pill}
              onPress={onRetry}
              accessibilityRole="button"
              testID="guide-retry"
            >
              <Icon name="retry" size={14} color={th.color.ink} />
              <Text variant="rowTextStrong">
                {t({ id: 'guide.error.retry', message: 'Try again' })}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            style={styles.pill}
            onPress={onRephrase}
            accessibilityRole="button"
            testID="guide-rephrase"
          >
            <Text variant="rowTextStrong">
              {t({ id: 'guide.premium.rephrase', message: 'Ask it differently' })}
            </Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}
