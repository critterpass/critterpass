/**
 * A place's name as the showdown (3c-1) and the reveal (3c-2) set it: display type at the size the
 * render draws it, wrapping between words, and set smaller only as far as its longest word needs to
 * stay whole in the box. The size comes from the words' measured widths rather than an estimate, so
 * a short name is as large as designed and a long one never splits a word. The type is laid out at
 * its designed size in a box widened by the same factor it is then scaled down by, so its lines
 * break exactly where the smaller type would break them.
 */
import { useEffect, useState } from 'react';
import { View, type AccessibilityRole } from 'react-native';

import { Text } from '@/ui/text/Text';

/** Wide enough that no word of a name wraps while the words are measured. */
const MEASURE_WIDTH = 4000;
/** Kept free beside the longest word, so rounding never pushes its last letter to the next line. */
const SLACK = 2;

export interface WordmarkMeasure {
  /** Line height when nothing but the box's width limits the name. */
  readonly designLine: number;
  /** Height when nothing but the box's width limits the name. */
  readonly designHeight: number;
  /** Height as set right now. */
  readonly height: number;
}

export interface WordmarkProps {
  /** The name, already in the case it is drawn in. */
  readonly name: string;
  /** The size the render sets it at, in points. */
  readonly designSize: number;
  readonly color: string;
  readonly align: 'start' | 'center' | 'end';
  /** A further cap on the size (1 = as large as the box's width allows). */
  readonly scale?: number;
  /** Laid out but not shown (while a caller is still settling on `scale`). */
  readonly hidden?: boolean;
  readonly accessibilityRole?: AccessibilityRole;
  readonly testID: string;
  readonly onMeasure?: (measure: WordmarkMeasure) => void;
}

interface WordWidths {
  readonly key: string;
  /** Each word's width at the designed size, by its place in the name. */
  readonly widths: readonly number[];
  /** Line height at the designed size. */
  readonly line: number;
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- style values, never copy.
const ORIGIN = { start: 'top left', center: 'top center', end: 'top right' } as const;
const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const;

/** How much smaller than designed the name is set so its widest word fits `box` (1 = as designed). */
export function widthFit(box: number, widestWord: number): number {
  return widestWord <= 0 ? 1 : Math.min(1, box / (widestWord + SLACK));
}

export function Wordmark({
  name,
  designSize,
  color,
  align,
  scale = 1,
  hidden = false,
  accessibilityRole,
  testID,
  onMeasure,
}: WordmarkProps) {
  const key = `${name}|${designSize}`;
  const [box, setBox] = useState(0);
  const parts = name.split(/\s+/u).filter(Boolean);
  const [words, setWords] = useState<WordWidths>({ key, widths: [], line: 0 });
  const [set, setSet] = useState({ key, height: 0 });
  const [design, setDesign] = useState({ key, box, height: 0 });
  const widths = words.key === key ? words.widths : [];
  const widest = parts.every((_, index) => (widths[index] ?? 0) > 0) ? Math.max(0, ...widths) : 0;
  const measured = widest > 0 && box > 0;
  const fit = measured ? widthFit(box, widest) : 1;
  const shown = fit * scale;
  const height = set.key === key ? set.height * shown : 0;
  // Adjusted while rendering: the height at the uncapped size is what a caller's cap is worked from.
  if (measured && scale === 1 && height > 0) {
    if (design.key !== key || design.box !== box || design.height !== height) {
      setDesign({ key, box, height });
    }
  }
  const designHeight = design.key === key && design.box === box ? design.height : 0;
  const designLine = measured ? words.line * fit : 0;
  useEffect(() => {
    if (designLine > 0 && designHeight > 0) onMeasure?.({ designLine, designHeight, height });
  }, [designLine, designHeight, height, onMeasure]);
  const widened = measured ? box / shown : MEASURE_WIDTH;
  return (
    <View
      style={{ alignSelf: 'stretch', height: measured && height > 0 ? height : undefined }}
      onLayout={(event) => setBox(event.nativeEvent.layout.width)}
      testID={`${testID}-box`}
    >
      {/* Each word on its own, in a box none can outgrow, so its line is as wide as the word. */}
      <View
        style={{ position: 'absolute', width: MEASURE_WIDTH, opacity: 0 }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {parts.map((word, index) => (
          <Text
            key={`${word}-${index}`}
            variant="displayMega"
            designSize={designSize}
            autoFit={false}
            testID={`${testID}-word-${index}`}
            onTextLayout={(event) => {
              const first = event.nativeEvent.lines[0];
              if (first === undefined) return;
              setWords((now) => {
                const held = now.key === key ? now.widths : [];
                if (held[index] === first.width && now.line === first.height) return now;
                const next = [...held];
                next[index] = first.width;
                return { key, widths: next, line: first.height };
              });
            }}
          >
            {word}
          </Text>
        ))}
      </View>
      <View
        style={[
          { position: 'absolute', top: 0, width: widened },
          align === 'end' ? { right: 0 } : { left: align === 'center' ? (box - widened) / 2 : 0 },
          measured
            ? { transform: [{ scale: shown }], transformOrigin: ORIGIN[align] }
            : { left: 0, opacity: 0 },
          hidden ? { opacity: 0 } : null,
        ]}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        testID={`${testID}-set`}
      >
        <Text
          variant="displayMega"
          designSize={designSize}
          autoFit={false}
          color={color}
          style={{ textAlign: TEXT_ALIGN[align] }}
          accessibilityRole={accessibilityRole}
          testID={testID}
          onLayout={(event) => {
            const laidOut = event.nativeEvent.layout.height;
            setSet((now) =>
              now.key === key && now.height === laidOut ? now : { key, height: laidOut },
            );
          }}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}
