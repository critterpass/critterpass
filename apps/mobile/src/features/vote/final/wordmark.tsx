/**
 * A place's name as the showdown (3c-1) and the reveal (3c-2) set it: display type at the size the
 * render draws it, wrapping between words, and set smaller only as far as its longest word needs to
 * stay whole in the box. The size comes from the words' measured widths rather than an estimate, so
 * a short name is as large as designed and a long one never splits a word. The type is laid out at
 * its designed size in a box widened by the same factor it is then scaled down by, so its lines
 * break exactly where the smaller type would break them. With `leading` the name takes the render's
 * tight line instead of the text's own taller box (see `wordmark-box.ts`), and keeps that room from
 * its first frame.
 */
import { useEffect, useState } from 'react';
import { View, type AccessibilityRole } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';

import { markRoom, reservedHeight, setInDisplayFace, typeSize, wordmarkBox } from './wordmark-box';

/** Wide enough that no word of a name wraps while the words are measured. */
const MEASURE_WIDTH = 4000;
/** Kept free beside the longest word, so rounding never pushes its last letter to the next line. */
const SLACK = 2;
/** Each step a name too tall for its room is set smaller by, and how far that goes. */
const SQUEEZE_STEP = 0.9;
const SQUEEZE_FLOOR = 0.3;

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
  /** The display face it is set in. @default 'displayMega' */
  readonly variant?: 'displayMega' | 'displayXl';
  /** The size the render sets it at, in points (inside the variant's range). */
  readonly designSize: number;
  /** The tallest the name may be: a name on more lines than fit is set smaller until it does. */
  readonly maxHeight?: number;
  /**
   * The line the render sets the name on, in em (0.8 on the showdown and the reveal): the name's
   * box is that line plus room for the marks it has. Without it the box is the text's own.
   */
  readonly leading?: number;
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
  /** A one-line text's height at the designed size: the line and the room the text adds. */
  readonly oneLine: number;
  /** The capitals' height the platform measured, when it reports one. */
  readonly capHeight: number | undefined;
}

const NO_WORDS: WordWidths = { key: '', widths: [], line: 0, oneLine: 0, capHeight: undefined };
const NO_ROOM = { top: 0, bottom: 0 } as const;

// eslint-disable-next-line lingui/no-unlocalized-strings -- style values, never copy.
const ORIGIN = { start: 'top left', center: 'top center', end: 'top right' } as const;
const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const;

/** How much smaller than designed the name is set so its widest word fits `box` (1 = as designed). */
export function widthFit(box: number, widestWord: number): number {
  return widestWord <= 0 ? 1 : Math.min(1, box / (widestWord + SLACK));
}

export function Wordmark({
  name,
  variant = 'displayMega',
  designSize,
  maxHeight,
  leading,
  color,
  align,
  scale = 1,
  hidden = false,
  accessibilityRole,
  testID,
  onMeasure,
}: WordmarkProps) {
  const key = `${name}|${variant}|${designSize}`;
  const locale = useLocale();
  const [box, setBox] = useState(0);
  const parts = name.split(/\s+/u).filter(Boolean);
  const [words, setWords] = useState<WordWidths>(NO_WORDS);
  const [set, setSet] = useState({ key, width: 0, height: 0, y: 0 });
  const [design, setDesign] = useState({ key, box, height: 0 });
  const [seen, setSeen] = useState<string | null>(null);
  const widths = words.key === key ? words.widths : [];
  const widest = parts.every((_, index) => (widths[index] ?? 0) > 0) ? Math.max(0, ...widths) : 0;
  const measured = widest > 0 && box > 0;
  // Past `maxHeight`, the name steps smaller (its box wider, so fewer lines) until it fits.
  const [squeeze, setSqueeze] = useState({ key, box, by: 1 });
  const squeezed = squeeze.key === key && squeeze.box === box ? squeeze.by : 1;
  const fit = (measured ? widthFit(box, widest) : 1) * squeezed;
  const shown = fit * scale;
  const widened = measured ? box / shown : MEASURE_WIDTH;
  // The text as it is laid out now, in the box it is meant to be in (not an earlier, wider one).
  const laidOut = set.key === key && set.height > 0;
  const current = measured && laidOut && Math.abs(set.width - widened) < 1;
  // On the designed line, the box is that line and the name's own mark room, not the text's box.
  const trimmed = leading !== undefined && setInDisplayFace(name, locale);
  const room = trimmed ? markRoom(name, leading) : NO_ROOM;
  const placed =
    trimmed && laidOut && words.key === key && words.line > 0 && words.oneLine > 0
      ? wordmarkBox(
          {
            size: typeSize(words.capHeight, designSize),
            line: words.line,
            oneLine: words.oneLine,
            height: set.height,
          },
          leading,
          room,
        )
      : { height: laidOut ? set.height : 0, top: 0 };
  const height = placed.height * shown;
  if (
    measured &&
    maxHeight !== undefined &&
    scale === 1 &&
    // Only a height measured in the box as it is now says the name is still too tall.
    current &&
    height > maxHeight + 0.5 &&
    squeezed > SQUEEZE_FLOOR
  ) {
    setSqueeze({ key, box, by: squeezed * SQUEEZE_STEP });
  }
  // Adjusted while rendering: the height at the uncapped size is what a caller's cap is worked from.
  if ((trimmed ? current : measured) && scale === 1 && height > 0) {
    if (design.key !== key || design.box !== box || design.height !== height) {
      setDesign({ key, box, height });
    }
  }
  // A trimmed name shows once it has been laid out in its own box, and stays shown while a new
  // size is laid out, so it neither flashes at a wrong size nor blinks when the size changes.
  if (trimmed && current && seen !== key) setSeen(key);
  const visible = measured && (!trimmed || seen === key || current);
  const designHeight = design.key === key && design.box === box ? design.height : 0;
  const designLine = measured ? words.line * fit : 0;
  useEffect(() => {
    if (designLine > 0 && designHeight > 0) onMeasure?.({ designLine, designHeight, height });
  }, [designLine, designHeight, height, onMeasure]);
  // The room is kept from the first frame, so what sits under the name does not jump when it lands.
  const reserved = trimmed ? reservedHeight(designSize, leading, room) * scale : undefined;
  return (
    <View
      style={{ alignSelf: 'stretch', height: visible && height > 0 ? height : reserved }}
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
            variant={variant}
            designSize={designSize}
            autoFit={false}
            testID={`${testID}-word-${index}`}
            onLayout={(event) => {
              const oneLine = event.nativeEvent.layout.height;
              setWords((now) => {
                const held = now.key === key ? now : { ...NO_WORDS, key };
                return held === now && now.oneLine === oneLine ? now : { ...held, oneLine };
              });
            }}
            onTextLayout={(event) => {
              const first = event.nativeEvent.lines[0];
              if (first === undefined) return;
              setWords((now) => {
                const held = now.key === key ? now : { ...NO_WORDS, key };
                if (held.widths[index] === first.width && held.line === first.height) return now;
                const next = [...held.widths];
                next[index] = first.width;
                return { ...held, widths: next, line: first.height, capHeight: first.capHeight };
              });
            }}
          >
            {word}
          </Text>
        ))}
      </View>
      <View
        style={[
          {
            position: 'absolute',
            top: -(placed.top + (trimmed && laidOut ? set.y : 0)) * shown,
            width: widened,
          },
          align === 'end' ? { right: 0 } : { left: align === 'center' ? (box - widened) / 2 : 0 },
          measured
            ? { transform: [{ scale: shown }], transformOrigin: ORIGIN[align] }
            : { left: 0 },
          visible ? null : { opacity: 0 },
          hidden ? { opacity: 0 } : null,
        ]}
        testID={`${testID}-set`}
      >
        <Text
          variant={variant}
          designSize={designSize}
          autoFit={false}
          color={color}
          style={{ textAlign: TEXT_ALIGN[align] }}
          accessibilityRole={accessibilityRole}
          testID={testID}
          onLayout={(event) => {
            const { width, height: textHeight, y } = event.nativeEvent.layout;
            setSet((now) =>
              now.key === key && now.height === textHeight && now.width === width && now.y === y
                ? now
                : { key, width, height: textHeight, y },
            );
          }}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}
