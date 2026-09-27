import { useEffect, useRef, useState } from 'react';

import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { useLocale } from '@/lib/i18n/use-locale';

import type { TextVariant } from '../text/Text';
import { Text } from '../text/Text';

const easing = bezierEasing(tokens.motion.easing.standard);
const COUNT_MS = tokens.motion.duration.medium;

/** Tweens a displayed number toward `target` on the JS thread (so it can be `Intl`-formatted). */
export function useTweenedNumber(target: number): number {
  const reduced = useReducedImpactMotion();
  const [shown, setShown] = useState(reduced ? target : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced) {
      from.current = target;
      return;
    }
    const start = Date.now();
    const origin = from.current;
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - start) / COUNT_MS);
      const next = origin + (target - origin) * easing(progress);
      from.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return reduced ? target : shown;
}

export interface CountUpProps {
  readonly value: number;
  /** Formats the rounded number; defaults to the locale's grouped integer. */
  readonly formatValue?: (value: number) => string;
  /** @default 'displayXl' */
  readonly variant?: TextVariant;
  readonly color?: string;
  /** Spoken context ("Kilometres walked"). */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Stat number that counts up from 0 (or its last value) instead of jumping; speaks the final value. */
export function CountUp({
  value,
  formatValue,
  variant = 'displayXl',
  color,
  accessibilityLabel,
  testID,
}: CountUpProps) {
  const locale = useLocale();
  const shown = useTweenedNumber(value);
  const render =
    formatValue ?? ((n: number) => format.number(locale, n, { maximumFractionDigits: 0 }));
  return (
    <Text
      testID={testID}
      variant={variant}
      color={color}
      accessibilityLabel={[accessibilityLabel, render(Math.round(value))]
        .filter(Boolean)
        .join(', ')}
    >
      {render(Math.round(shown))}
    </Text>
  );
}
