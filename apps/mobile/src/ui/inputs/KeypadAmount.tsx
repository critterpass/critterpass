import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { useOdometer } from '@/motion/patterns/odometer';
import { useLocale } from '@/lib/i18n/use-locale';

import { SecondaryText } from '../cards/SecondaryText';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface KeypadAmountProps {
  /** Whole amount in the currency's display unit (the keypad's digit string as a number). */
  readonly value: number;
  /** Currency symbol or code before the number ("Rp", "$"). */
  readonly currency: string;
  /** The "≈ $28.42 · $4.74 each" line under the amount. */
  readonly approx?: string;
  /** Formatted amount for screen readers ("Rp 450,000"). */
  readonly label: string;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** How far below its measuring frame the probe line is laid, clear of any face's glyph room. */
const PROBE_OFFSET = 400;

/**
 * Where a display line sits, from a probe laid `PROBE_OFFSET` below its frame's top: `slot` is
 * the height a static line of the style takes in a column (its tight leading), `lift` how far the
 * text's own box starts above that slot (its glyph room less the iOS line shift), and `pitch` the
 * height of one rolling cell, which holds the whole box.
 */
export interface DigitWindow {
  readonly slot: number;
  readonly lift: number;
  readonly pitch: number;
}

export function digitWindow(probe: {
  /** Height of the probe's frame: `PROBE_OFFSET` plus the line's slot. */
  readonly frameHeight: number;
  /** The probe text's top in its frame. */
  readonly textY: number;
}): DigitWindow {
  const slot = Math.max(0, probe.frameHeight - PROBE_OFFSET);
  const lift = Math.max(0, PROBE_OFFSET - probe.textY);
  return { slot, lift, pitch: slot + lift };
}

const useStyles = makeStyles((t) => ({
  clip: { overflow: 'hidden' },
  strip: { position: 'absolute', start: 0 },
  probe: { position: 'absolute', top: 0, start: 0, opacity: 0, paddingTop: PROBE_OFFSET },
  currency: { marginBottom: t.space['8'] },
}));

/**
 * Measures a displayHero line off screen: its slot and how far the text's box rises above it. The
 * digits then sit in windows exactly one slot tall, placed where a static line of the style puts
 * them (the iOS shift included), with no glyph room reserved above or below: numerals never reach
 * the stacked-mark height that room is kept for.
 */
function DigitProbe({ onMeasure }: { readonly onMeasure: (metrics: DigitWindow) => void }) {
  const styles = useStyles();
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [textY, setTextY] = useState<number | null>(null);
  useEffect(() => {
    if (frameHeight !== null && textY !== null) onMeasure(digitWindow({ frameHeight, textY }));
  }, [frameHeight, textY, onMeasure]);
  return (
    <View
      style={styles.probe}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event: LayoutChangeEvent) => setFrameHeight(event.nativeEvent.layout.height)}
    >
      <Text variant="displayHero" onLayout={(event) => setTextY(event.nativeEvent.layout.y)}>
        0
      </Text>
    </View>
  );
}

/** One slot-tall window onto a cell: the text's box starts `lift` above it, so it is never pulled
 * above its parent (which would keep the room inside and push the digits down). */
function Cell({ metrics, children }: { readonly metrics: DigitWindow; readonly children: string }) {
  return (
    <View style={{ height: metrics.pitch, paddingTop: metrics.lift }}>
      <Text variant="displayHero">{children}</Text>
    </View>
  );
}

function Column({
  value,
  metrics,
}: {
  readonly value: SharedValue<number>;
  readonly metrics: DigitWindow;
}) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -(((value.value % 10) + 10) % 10) * metrics.pitch }],
  }));
  return (
    <View style={[styles.clip, { height: metrics.slot }]}>
      {/* Width only: the strip is absolute, so the window takes a digit's width from this one. */}
      <View style={{ height: 0, opacity: 0 }}>
        <Text variant="displayHero">0</Text>
      </View>
      <Animated.View style={[styles.strip, { top: -metrics.lift }, style]}>
        {DIGITS.map((digit, index) => (
          <Cell key={index} metrics={metrics}>
            {digit}
          </Cell>
        ))}
      </Animated.View>
    </View>
  );
}

function Separator({ metrics, glyph }: { readonly metrics: DigitWindow; readonly glyph: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.clip, { height: metrics.slot }]}>
      <View style={{ marginTop: -metrics.lift }}>
        <Cell metrics={metrics}>{glyph}</Cell>
      </View>
    </View>
  );
}

function groupSeparator(locale: string): string {
  // Hermes on iOS has no `NumberFormat#formatToParts`; the separator is whatever 1000 formats with
  // besides its digits (",", ".", a narrow no-break space…).
  const separator = new Intl.NumberFormat(locale).format(1000).replace(/\d/g, '');
  return separator || ',';
}

/** The keypad's rolling amount (odometer digits, locale grouping) with the ≈ conversion line. */
export function KeypadAmount({ value, currency, approx, label }: KeypadAmountProps) {
  const styles = useStyles();
  const locale = useLocale();
  const { columns } = useOdometer(value);
  const [metrics, setMetrics] = useState<DigitWindow | null>(null);
  const onMeasure = useCallback(
    (next: DigitWindow) =>
      setMetrics((current) =>
        current !== null && current.slot === next.slot && current.lift === next.lift
          ? current
          : next,
      ),
    [],
  );
  const separator = groupSeparator(locale);
  const digitColumns = columns.filter((column) => !column.isSign);
  return (
    <Stack
      gap="4"
      align="center"
      accessible
      accessibilityLabel={approx ? `${label}, ${approx}` : label}
      accessibilityLiveRegion="polite"
    >
      <Row gap="6" align="flex-end">
        <DigitProbe onMeasure={onMeasure} />
        <Text variant="h3" color={undefined} style={styles.currency}>
          {currency}
        </Text>
        {metrics === null ? null : (
          <Row>
            {digitColumns.map((column, index) => {
              const fromRight = digitColumns.length - index;
              const grouped = fromRight % 3 === 0 && index > 0;
              return (
                <Row key={column.key}>
                  {grouped ? <Separator metrics={metrics} glyph={separator} /> : null}
                  <Column value={column.value} metrics={metrics} />
                </Row>
              );
            })}
          </Row>
        )}
      </Row>
      {approx ? <SecondaryText>{approx}</SecondaryText> : null}
    </Stack>
  );
}
