import { useEffect, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { useTypewriter } from '@/motion/patterns/typewriter';

import type { TextVariant } from '../text/Text';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface StreamTextProps {
  /** Full text (typewriter reveal) or the text streamed so far (grows between renders). */
  readonly text: string;
  /** The stream has finished; the completed text is announced once. @default true */
  readonly complete?: boolean;
  /** @default 'voice' */
  readonly variant?: TextVariant;
  readonly color?: string;
  readonly wordsPerSecond?: number;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  ghost: { opacity: 0 },
  live: { position: 'absolute', top: 0, start: 0, end: 0 },
}));

/**
 * Word-buffered reveal of guide text. The full text is laid out invisibly underneath so the box
 * never reflows; screen readers get the text once, announced when the stream completes.
 */
export function StreamText({
  text,
  complete = true,
  variant = 'voice',
  color,
  wordsPerSecond,
  testID,
}: StreamTextProps) {
  const styles = useStyles();
  const { visibleText, isRevealing } = useTypewriter({
    text,
    ...(wordsPerSecond === undefined ? {} : { wordsPerSecond }),
  });
  const finished = complete && !isRevealing;
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || announced.current === text) return;
    announced.current = text;
    AccessibilityInfo.announceForAccessibility(text);
  }, [finished, text]);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityState={{ busy: !finished }}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant={variant} color={color} style={styles.ghost}>
          {text}
        </Text>
        <Text variant={variant} color={color} style={styles.live}>
          {visibleText}
        </Text>
      </View>
    </View>
  );
}
