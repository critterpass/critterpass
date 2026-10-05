/**
 * "ASK IN PLAIN WORDS" (7d-1): three questions for this trip, typed out by the guide one after
 * another with a blinking caret, then still. Reduced motion shows them still at once. Tapping one
 * asks it.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useMotionMode } from '@/motion/motion-mode';
import { makeStyles, Text, useTheme } from '@/ui';
import { PressScale } from '@/ui/press/PressScale';

const CHAR_MS = 28;
const PAUSE_MS = 260;
const BLINK_MS = 480;
// Text presentation, so iOS never draws it as an emoji.
const ARROW = '↗\uFE0E';

const useStyles = makeStyles((th) => ({
  list: { gap: th.space['8'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    paddingVertical: th.space['10'],
    paddingHorizontal: th.space['14'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
  },
  text: { flex: 1 },
}));

/** How many characters of each example show `elapsed` ms in: one after another, then all. */
export function typedLengths(examples: readonly string[], elapsed: number): number[] {
  let left = elapsed;
  return examples.map((example) => {
    const needed = example.length * CHAR_MS;
    if (left >= needed) {
      left -= needed + PAUSE_MS;
      return example.length;
    }
    const shown = Math.max(0, Math.floor(left / CHAR_MS));
    left = -1;
    return shown;
  });
}

export interface TypedExamplesProps {
  readonly examples: readonly string[];
  readonly onAsk: (question: string) => void;
  /** Lab and tests: show them still, fully typed. */
  readonly still?: boolean;
}

export function TypedExamples({ examples, onAsk, still = false }: TypedExamplesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const animate = !still && motionMode === 'full';
  const total = examples.reduce((sum, example) => sum + example.length * CHAR_MS + PAUSE_MS, 0);
  const [elapsed, setElapsed] = useState(animate ? 0 : total);
  useEffect(() => {
    if (!animate) return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      const next = Date.now() - started;
      setElapsed(next);
      if (next >= total + BLINK_MS * 4) clearInterval(timer);
    }, CHAR_MS);
    return () => clearInterval(timer);
  }, [animate, total]);
  const lengths = animate ? typedLengths(examples, elapsed) : examples.map((e) => e.length);
  const typing = lengths.findIndex((length, index) => length < (examples[index]?.length ?? 0));
  const caretOn =
    animate && elapsed < total + BLINK_MS * 4 && Math.floor(elapsed / BLINK_MS) % 2 === 0;
  const caretAt = typing === -1 ? examples.length - 1 : typing;
  return (
    <View style={styles.list}>
      <Text variant="eyebrow">
        {t({ id: 'search.examples.eyebrow', message: 'Ask in plain words' })}
      </Text>
      {examples.map((example, index) => {
        const shown = example.slice(0, lengths[index] ?? 0);
        const caret = caretOn && index === caretAt ? '|' : '';
        return (
          <PressScale
            key={example}
            accessibilityRole="button"
            accessibilityLabel={example}
            onPress={() => onAsk(example)}
            testID={`search-example-${String(index)}`}
          >
            <View style={styles.row}>
              <Text variant="voice" color={theme.semantic.action.primary} style={styles.text}>
                {shown === ''
                  ? ' '
                  : `“${shown}${shown.length === example.length ? '”' : ''}${caret}`}
              </Text>
              <Text variant="body" color={theme.semantic.text.secondary}>
                {ARROW}
              </Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

/**
 * The trip's three examples: dinner near the stay (without "near the stay" while the trip has no
 * stay to measure from), a sight on a free day, a rainy-day question.
 */
export function plainExamples(input: {
  readonly destination: string;
  readonly freeWeekday: string | null;
  readonly stay: boolean;
}): string[] {
  const destination = input.destination;
  const day = input.freeWeekday ?? t({ id: 'search.examples.saturday', message: 'Saturday' });
  return [
    input.stay
      ? t({
          id: 'search.examples.dinner',
          message: 'somewhere quiet for dinner near the stay, open late',
        })
      : t({
          id: 'search.examples.dinnerNoStay',
          message: 'somewhere quiet for dinner, open late',
        }),
    t({ id: 'search.examples.crowds', message: `a waterfall without the crowds, on ${day}` }),
    t({
      id: 'search.examples.rain',
      message: `what to do in ${destination} when it rains`,
    }),
  ];
}
