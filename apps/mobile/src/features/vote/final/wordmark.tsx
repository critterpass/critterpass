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
import { useEffect, useMemo, useState } from 'react';
import { View, type AccessibilityRole } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';

import {
  countLines,
  markRoom,
  reservedHeight,
  setInDisplayFace,
  typeSize,
  widthFit,
  wordmarkBox,
} from './wordmark-box';
import { MEASURE_WIDTH, WordProbes } from './wordmark-probes';

/** Each step a name too tall for its room is set smaller by, and how far that goes. */
const SQUEEZE_STEP = 0.9;
const SQUEEZE_FLOOR = 0.3;

export interface WordmarkMeasure {
  /**
   * The name's size when nothing but the box's width limits it: its type size on the designed line
   * (`leading`), its line height otherwise. Two names at one `designLine` are set at one size.
   */
  readonly designLine: number;
  /** Height when nothing but the box's width limits the name. */
  readonly designHeight: number;
  /** Height as set right now. */
  readonly height: number;
  /**
   * On the designed line: the box's height with the name set at `scale` of its width-limited size.
   * A smaller name has more room on each line, so it may take fewer lines than a straight scaling
   * of `designHeight` says.
   */
  readonly heightAt?: (scale: number) => number;
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
  /** The capitals' height the platform measured, when it reports one. */
  readonly capHeight: number | undefined;
  /** The whole name's width on one line at the designed size (what a space adds between words). */
  readonly whole: number;
}

const NO_WORDS: WordWidths = {
  key: '',
  widths: [],
  line: 0,
  capHeight: undefined,
  whole: 0,
};
const NO_ROOM = { top: 0, bottom: 0 } as const;

// eslint-disable-next-line lingui/no-unlocalized-strings -- style values, never copy.
const ORIGIN = { start: 'top left', center: 'top center', end: 'top right' } as const;
const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const;

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
  // The name's own lines, as the platform broke them.
  const [lines, setLines] = useState({ key, count: 0, line: 0, tallest: 0 });
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
  const size = typeSize(words.key === key ? words.capHeight : undefined, designSize);
  // The name's lines and its height come in two events: they describe one layout only when what is
  // left of the height after the lines is the text's own room above them, less than a line.
  const above = set.height - lines.line * lines.count;
  const broken =
    laidOut && lines.key === key && lines.count > 0 && above > -0.5 && above < lines.line;
  const placed =
    trimmed && broken
      ? wordmarkBox(
          { size, line: lines.line, lines: lines.count, height: set.height },
          leading,
          room,
        )
      : { height: laidOut ? set.height : 0, top: 0 };
  // A layout to go by: for a name on the designed line, its own box and its lines, both current.
  const settled = trimmed ? current && broken : measured;
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
  if (!trimmed && measured && scale === 1 && height > 0) {
    if (design.key !== key || design.box !== box || design.height !== height) {
      setDesign({ key, box, height });
    }
  }
  // A trimmed name shows once it has been laid out in its own box, and stays shown while a new
  // size is laid out, so it neither flashes at a wrong size nor blinks when the size changes.
  if (trimmed && settled && seen !== key) setSeen(key);
  const visible = trimmed ? seen === key || settled : measured;
  // On the designed line the box's height at any size follows from the words' widths: the lines
  // they take in the room that size leaves, on the name's own line height.
  // The text opens its leading when a wrapped line carries marks, so the tallest line seen is the
  // one counted on: a size is never judged to fit on the tighter line and then not on the looser.
  const lineGap = lines.key === key ? lines.tallest : 0;
  const space =
    parts.length > 1 && words.key === key && words.whole > 0
      ? Math.max(
          0,
          (words.whole - widths.reduce((sum, width) => sum + width, 0)) / (parts.length - 1),
        )
      : null;
  const roomEm = room.top + room.bottom;
  const heightAt = useMemo(() => {
    if (!trimmed || !measured || lineGap <= 0 || (parts.length > 1 && space === null)) {
      return undefined;
    }
    return (at: number) => {
      const sized = fit * at;
      const count = countLines(widths, space ?? 0, box / sized);
      return ((count - 1) * lineGap + (leading + roomEm) * size) * sized;
    };
    // `widths` is replaced whenever a word's width changes; `parts` follows `name`, in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, measured, lineGap, space, widths, fit, box, leading, roomEm, size, key]);
  const designHeight =
    heightAt !== undefined
      ? heightAt(1)
      : design.key === key && design.box === box
        ? design.height
        : 0;
  // On the designed line a name is compared by its type size: the text's own line height differs
  // between a plain name and a marked one, which is set on looser leading.
  const designLine = measured ? (trimmed ? size : words.line) * fit : 0;
  useEffect(() => {
    if (designLine <= 0 || designHeight <= 0) return;
    onMeasure?.({
      designLine,
      designHeight,
      height,
      ...(heightAt === undefined ? {} : { heightAt }),
    });
  }, [designLine, designHeight, height, heightAt, onMeasure]);
  // The room is kept from the first frame, so what sits under the name does not jump when it lands.
  const reserved = trimmed ? reservedHeight(designSize, leading, room) * scale : undefined;
  return (
    <View
      style={{ alignSelf: 'stretch', height: visible && height > 0 ? height : reserved }}
      onLayout={(event) => setBox(event.nativeEvent.layout.width)}
      testID={`${testID}-box`}
    >
      <WordProbes
        name={name}
        parts={parts}
        whole={trimmed && parts.length > 1}
        variant={variant}
        designSize={designSize}
        testID={testID}
        onWord={(index, width, line, capHeight) =>
          setWords((now) => {
            const held = now.key === key ? now : { ...NO_WORDS, key };
            if (held.widths[index] === width && held.line === line) return now;
            const next = [...held.widths];
            next[index] = width;
            return { ...held, widths: next, line, capHeight };
          })
        }
        onWhole={(whole) =>
          setWords((now) => {
            const held = now.key === key ? now : { ...NO_WORDS, key };
            return held === now && now.whole === whole ? now : { ...held, whole };
          })
        }
      />
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
          onTextLayout={(event) => {
            const count = event.nativeEvent.lines.length;
            const line = event.nativeEvent.lines[0]?.height ?? 0;
            setLines((now) =>
              now.key === key && now.count === count && now.line === line
                ? now
                : { key, count, line, tallest: Math.max(now.key === key ? now.tallest : 0, line) },
            );
          }}
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
