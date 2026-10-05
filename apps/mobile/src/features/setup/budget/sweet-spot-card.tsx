/**
 * The yellow sweet-spot card (3c-5): "SWEET SPOT, EACH" with the under-all check, the target as a
 * rolling amount, and the track with the knob among anonymous dots. The knob drags (or steps with a
 * screen reader) in the crew's steps (₫500,000, $50), ticking on every step and warning as it crosses the top of
 * the band. Dots are bucketed positions from the server; nothing here knows whose, or any max.
 */
import { BUDGET_K_MIN } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';
import { Card } from '@/ui/cards/Card';
import { Odometer } from '@/ui/data/Odometer';
import { RangePrivateMarkers } from '@/ui/inputs/RangePrivateMarkers';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useAmountFace } from './amount-fit';
import { currencySymbol, fractionDigits, money, snap, type BandView, type Track } from './model';

const KNOB = 32;

const useStyles = makeStyles((th) => ({
  card: { padding: th.space['16'], gap: th.space['10'] },
  head: { gap: th.space['8'] },
  eyebrow: { flexShrink: 1 },
  caption: { textAlign: 'center' },
}));

export interface SweetSpotCardProps {
  readonly band: BandView;
  readonly track: Track;
  readonly currency: string;
  readonly target: number;
  readonly onTarget: (targetMinor: number) => void;
}

export function isOverBand(band: BandView, target: number): boolean {
  return band.kind === 'band' && target > band.highMinor;
}

function statusLine(band: BandView, over: boolean): string | null {
  const { set, of } = band;
  if (band.kind === 'waiting') {
    return t({ id: 'setup.budget.card.waiting', message: `${set} of ${of} set` });
  }
  if (band.kind === 'infeasible') return null;
  if (over) return t({ id: 'setup.budget.card.over', message: 'Over someone’s max' });
  return band.underAll
    ? t({ id: 'setup.budget.card.underAll', message: `✓ Under all ${set} maxes` })
    : t({ id: 'setup.budget.card.underCounted', message: `✓ Under ${set} of ${of} maxes` });
}

export function SweetSpotCard({ band, track, currency, target, onTarget }: SweetSpotCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [width, setWidth] = useState(0);
  const over = isOverBand(band, target);
  const span = Math.max(1, track.maxMinor - track.minMinor);
  const whole = Math.round(target / 10 ** fractionDigits(currency));
  const amount = money(locale, target, currency);
  const symbol = currencySymbol(locale, currency);
  const fit = useAmountFace(
    locale,
    symbol,
    Math.round(track.maxMinor / 10 ** fractionDigits(currency)),
  );
  // End labels long enough to push the amount off the hero face leave the caption no room
  // between them: it then sits on its own line under the track.
  const captionBelow = fit.face !== 'displayHero';

  const set = (raw: number) => {
    const next = snap(raw, track);
    if (next === target) return;
    const crossed = isOverBand(band, next) !== isOverBand(band, target);
    feedback.emit(crossed ? 'warning' : 'tick');
    onTarget(next);
  };
  const fromX = (x: number) =>
    set(track.minMinor + ((x - KNOB / 2) / Math.max(1, width - KNOB)) * span);

  const pan = Gesture.Pan()
    .enabled(width > 0)
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      scheduleOnRN(fromX, event.x);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(fromX, event.x);
    });

  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(target + track.stepMinor);
    if (event.nativeEvent.actionName === 'decrement') set(target - track.stepMinor);
  };

  const dots = band.kind === 'waiting' ? [] : (band.dots ?? []).map((d) => d * band.trackHighMinor);
  const status = statusLine(band, over);
  const ink = theme.semantic.text.onAccent;
  const caption =
    band.kind === 'waiting'
      ? band.of < BUDGET_K_MIN
        ? // A crew under four never reaches a band or dots: say what does hold.
          t({ id: 'setup.budget.card.captionSmallCrew', message: 'every max stays private' })
        : t({ id: 'setup.budget.card.captionWaiting', message: 'dots appear from four maxes' })
      : band.dots === null
        ? t({ id: 'setup.budget.card.captionNoDots', message: 'the band sits under every max' })
        : t({ id: 'setup.budget.card.caption', message: 'each dot is someone’s max' });
  const summary =
    status === null
      ? t({ id: 'setup.budget.card.a11y', message: `Sweet spot ${amount} each` })
      : t({ id: 'setup.budget.card.a11yStatus', message: `Sweet spot ${amount} each, ${status}` });

  return (
    <Card tone="yellow" halftone style={styles.card} testID="budget-sweet-spot">
      <Row justify="space-between" align="center" style={styles.head}>
        <Text variant="eyebrow" color={ink} style={styles.eyebrow}>
          {t({ id: 'setup.budget.card.eyebrow', message: 'Sweet spot, each' })}
        </Text>
        {status === null ? null : (
          <Text
            variant="label"
            color={over ? theme.semantic.state.urgent : ink}
            testID="budget-under-all"
          >
            {status}
          </Text>
        )}
      </Row>
      <View
        onLayout={fit.onAvailable}
        style={{ opacity: fit.settled ? 1 : 0 }}
        testID="budget-amount-box"
      >
        {fit.measurer}
        {/* Remounted per face: the odometer measures its line once, in the face it starts in. */}
        <Odometer
          key={fit.face}
          value={whole}
          prefix={symbol}
          variant={fit.face}
          color={ink}
          accessibilityLabel={t({ id: 'setup.budget.card.amountA11y', message: 'Sweet spot each' })}
          testID="budget-target"
        />
      </View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={summary}
          accessibilityValue={{ text: amount }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAction}
          importantForAccessibility="yes"
          testID="budget-track"
        >
          <View importantForAccessibility="no-hide-descendants">
            <RangePrivateMarkers
              min={track.minMinor}
              max={track.maxMinor}
              markers={dots}
              sweetSpot={target}
              minLabel={money(locale, track.minMinor, currency)}
              maxLabel={money(locale, track.maxMinor, currency)}
              {...(captionBelow ? {} : { caption })}
              summary={summary}
            />
          </View>
        </View>
      </GestureDetector>
      {captionBelow ? (
        <Text variant="monoData" color={ink} style={styles.caption} testID="budget-caption">
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}
