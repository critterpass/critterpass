/**
 * What a wordmark measures before it is set: each word on its own, and the whole name on one line,
 * at the designed size, in a hidden box none of them can outgrow. A word's line is as wide as the
 * word, and the whole name's line says what a space adds between words.
 */
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';

/** Wide enough that no word of a name wraps while the words are measured. */
export const MEASURE_WIDTH = 4000;

export interface WordProbesProps {
  readonly name: string;
  readonly parts: readonly string[];
  /** Measure the whole name on one line too (a name of several words on the designed line). */
  readonly whole: boolean;
  readonly variant: 'displayMega' | 'displayXl';
  readonly designSize: number;
  readonly testID: string;
  /** A word's width, its line's height and the capitals' height the platform measured. */
  readonly onWord: (
    index: number,
    width: number,
    line: number,
    capHeight: number | undefined,
  ) => void;
  /** The whole name's width on one line (0 while it is not on one). */
  readonly onWhole: (width: number) => void;
}

export function WordProbes({
  name,
  parts,
  whole,
  variant,
  designSize,
  testID,
  onWord,
  onWhole,
}: WordProbesProps) {
  return (
    <View
      style={{ position: 'absolute', width: MEASURE_WIDTH, opacity: 0 }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {whole ? (
        <Text
          variant={variant}
          designSize={designSize}
          autoFit={false}
          testID={`${testID}-whole`}
          onTextLayout={(event) => {
            const rows = event.nativeEvent.lines;
            onWhole(rows.length === 1 ? (rows[0]?.width ?? 0) : 0);
          }}
        >
          {name}
        </Text>
      ) : null}
      {parts.map((word, index) => (
        <Text
          key={`${word}-${index}`}
          variant={variant}
          designSize={designSize}
          autoFit={false}
          testID={`${testID}-word-${index}`}
          onTextLayout={(event) => {
            const first = event.nativeEvent.lines[0];
            if (first !== undefined) onWord(index, first.width, first.height, first.capHeight);
          }}
        >
          {word}
        </Text>
      ))}
    </View>
  );
}
