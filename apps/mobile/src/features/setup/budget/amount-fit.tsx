/**
 * The face the sweet-spot amount is set in. The design's amount is four digits in dollars in the
 * hero face; in đồng or rupiah the same amount runs to eleven glyphs and more. The face is chosen
 * by measurement: the widest the amount gets on this track (its far end, every digit as wide as
 * the widest numeral, which is how the rolling digits are laid out) is measured glyph by glyph in
 * the face, and the face steps down only until that width fits the card, never below the floor.
 * Sized by the track's far end, so it does not change as the knob moves.
 */
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { format } from '@cp/i18n';

import { Text } from '@/ui/text/Text';

/** Largest first; the last is the floor. */
export const AMOUNT_FACES = ['displayHero', 'displayXl', 'h1', 'h2'] as const;
export type AmountFace = (typeof AMOUNT_FACES)[number];

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/** Wide enough that no measured glyph is ever squeezed or wrapped. */
const MEASURE_ROOM = 4000;

/** The amount at the track's far end as the odometer sets it: prefix, then the grouped number. */
export function longestAmount(locale: string, prefix: string, wholeMax: number) {
  const grouped = format.number(locale, Math.abs(Math.trunc(wholeMax)), {
    maximumFractionDigits: 0,
  });
  return { prefix, grouped };
}

/** Every glyph whose width the amount's width is made of. */
export function glyphsOf(amount: { readonly prefix: string; readonly grouped: string }): string[] {
  const separators = [...new Set([...amount.grouped].filter((char) => !/[0-9]/u.test(char)))];
  return [...(amount.prefix === '' ? [] : [amount.prefix]), ...DIGITS, ...separators];
}

/**
 * The amount's width from measured glyph widths, or null while any is still unmeasured. Each
 * digit takes the widest numeral's width: a rolling column holds all ten.
 */
export function amountWidth(
  amount: { readonly prefix: string; readonly grouped: string },
  widths: Readonly<Record<string, number>>,
): number | null {
  if (glyphsOf(amount).some((glyph) => widths[glyph] === undefined)) return null;
  const digit = Math.max(...DIGITS.map((d) => widths[d] ?? 0));
  const body = [...amount.grouped].reduce(
    (sum, char) => sum + (/[0-9]/u.test(char) ? digit : (widths[char] ?? 0)),
    0,
  );
  return (amount.prefix === '' ? 0 : (widths[amount.prefix] ?? 0)) + body;
}

/** The face to try next: one down when the amount is wider than the card, else this one. */
export function nextLevel(level: number, width: number, available: number): number {
  return width > available + 0.5 && level < AMOUNT_FACES.length - 1 ? level + 1 : level;
}

interface Fit {
  readonly key: string;
  readonly level: number;
}

/**
 * `face` for the amount, `settled` once the measured amount fits it (or the floor is reached),
 * `onAvailable` for the box the amount sits in, and `measurer`: the hidden glyphs to render.
 *
 * A glyph's width belongs to its face alone, so measured widths are kept for good: another
 * track, currency or card width starts again from the hero face but never waits for a glyph
 * that is already on screen to be laid out a second time (it would not be, and the amount
 * would stay hidden).
 */
export function useAmountFace(locale: string, prefix: string, wholeMax: number) {
  const amount = longestAmount(locale, prefix, wholeMax);
  const [available, setAvailable] = useState(0);
  const key = `${amount.prefix}${amount.grouped}|${available}`;
  const [fit, setFit] = useState<Fit>({ key, level: 0 });
  /** Face → glyph → width. */
  const [measured, setMeasured] = useState<Readonly<Record<string, Record<string, number>>>>({});
  const current = fit.key === key ? fit : { key, level: 0 };
  const face: AmountFace = AMOUNT_FACES[current.level] ?? 'h2';
  const width = amountWidth(amount, measured[face] ?? {});
  const next = width === null || available <= 0 ? null : nextLevel(current.level, width, available);
  if (next !== null && next !== current.level) setFit({ key, level: next });
  else if (fit !== current) setFit(current);
  const settled = next !== null && next === current.level;
  const onGlyph = (glyph: string, glyphWidth: number) =>
    setMeasured((now) =>
      now[face]?.[glyph] === glyphWidth
        ? now
        : { ...now, [face]: { ...now[face], [glyph]: glyphWidth } },
    );
  const measurer = settled ? null : (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', opacity: 0, flexDirection: 'row', width: MEASURE_ROOM }}
    >
      {glyphsOf(amount).map((glyph) => (
        <Text
          key={`${face}:${glyph}`}
          variant={face}
          autoFit={false}
          onLayout={(event) => onGlyph(glyph, event.nativeEvent.layout.width)}
          testID={`budget-amount-glyph-${glyph}`}
        >
          {glyph}
        </Text>
      ))}
    </View>
  );
  return {
    face,
    settled,
    measurer,
    onAvailable: (event: LayoutChangeEvent) => setAvailable(event.nativeEvent.layout.width),
  };
}
