/**
 * "Up and down, one chart" (7.17): one row per member from a centre line, mint growing right for
 * what they are owed, tangerine growing left for what they owe, a grey stub when even. Bars grow
 * from the centre on the Smooth spring (a transform, never a width per frame) and the amounts
 * roll; a row opens that member's expenses. Members read by the name they are called by.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { shortName } from '@/lib/people/member-name';
import {
  Card,
  PressableScale,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { BalanceLine } from '../../balances/model';
import { formatSigned } from '../../format';
import { RollingAmount } from './RollingAmount';

/** The name column's floor; a longer given name takes up to 30% of the row. */
const NAME_WIDTH = 56;
const VALUE_WIDTH = 72;
const STUB = 4;

function Bar({ line }: { readonly line: BalanceLine }) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const share = useSharedValue(0);
  useEffect(() => {
    share.set(
      reduced ? withTiming(line.fraction, REDUCED_FADE) : withSpring(line.fraction, SPRINGS.smooth),
    );
  }, [line.fraction, reduced, share]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: share.get() }] }));
  return (
    <View style={styles.track}>
      <View style={[styles.half, styles.left]}>
        {line.direction === 'owes' ? (
          <Animated.View
            style={[
              styles.bar,
              styles.full,
              styles.fromRight,
              { backgroundColor: th.accent.tangerine },
              grow,
            ]}
          />
        ) : null}
      </View>
      <View style={[styles.centre, { backgroundColor: th.color.hairline }]} />
      <View style={styles.half}>
        {line.direction === 'owed' ? (
          <Animated.View
            style={[
              styles.bar,
              styles.full,
              styles.fromLeft,
              { backgroundColor: th.accent.mint },
              grow,
            ]}
          />
        ) : line.direction === 'even' ? (
          <View style={[styles.bar, { width: STUB, backgroundColor: th.color.outlineEmpty }]} />
        ) : null}
      </View>
    </View>
  );
}

export function BalanceBars({
  lines,
  currency,
  onMember,
}: {
  readonly lines: readonly BalanceLine[];
  readonly currency: string;
  readonly onMember: (userId: string) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  // One amount column for every row, as wide as the widest amount (−200,000 ₫ needs more than the
  // design's dollars), so the centre line stays straight down the card.
  const [valueWidth, setValueWidth] = useState(VALUE_WIDTH);
  // The same for the names, so the bars start on one line under the "Owes" head.
  const [nameWidth, setNameWidth] = useState(NAME_WIDTH);
  return (
    <Card
      style={{
        marginHorizontal: th.space.gutter,
        paddingHorizontal: th.space.gap16,
        paddingTop: th.space.gap12,
        paddingBottom: th.space.gap8,
      }}
      testID="money-bars"
    >
      <View style={[styles.heads, { paddingStart: nameWidth + th.space.gap8 }]}>
        <Text variant="badge" tone="muted" style={styles.flex}>
          {t({ id: 'money.bars.owes', message: 'Owes' })}
        </Text>
        <Text
          variant="badge"
          tone="muted"
          style={[styles.flex, { paddingEnd: valueWidth }]}
          align="right"
        >
          {t({ id: 'money.bars.owed', message: 'Is owed' })}
        </Text>
      </View>
      {lines.map((line) => {
        const name = line.me ? t({ id: 'money.bars.you', message: 'You' }) : shortName(line.name);
        const value = formatSigned(line.netMinor, currency, locale);
        const color =
          line.direction === 'owed'
            ? th.color.status.booked.text
            : line.direction === 'owes'
              ? th.color.status.tangerine.text
              : th.color.muted;
        return (
          <PressableScale
            key={line.userId}
            onPress={() => onMember(line.userId)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${value}`}
            testID={`money-bar-${line.userId}`}
          >
            <View style={[styles.row, { gap: th.space.gap8 }]}>
              <Text
                variant={line.me ? 'rowTextStrong' : 'rowText'}
                numberOfLines={1}
                style={[styles.name, { minWidth: nameWidth }]}
                onLayout={(event) => {
                  const width = Math.ceil(event.nativeEvent.layout.width);
                  setNameWidth((current) => Math.max(current, width));
                }}
              >
                {name}
              </Text>
              <Bar line={line} />
              <View
                style={{ minWidth: valueWidth, flexShrink: 0, alignItems: 'flex-end' }}
                onLayout={(event) => {
                  const width = Math.ceil(event.nativeEvent.layout.width);
                  setValueWidth((current) => Math.max(current, width));
                }}
              >
                <PrivateContent>
                  <RollingAmount text={value} variant="rowTextStrong" color={color} />
                </PrivateContent>
              </View>
            </View>
          </PressableScale>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  heads: { flexDirection: 'row', marginBottom: 4 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  name: { maxWidth: '30%' },
  track: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 12 },
  half: { flex: 1, height: 12, flexDirection: 'row' },
  left: { justifyContent: 'flex-end' },
  centre: { width: 1, height: 20 },
  bar: { height: 12, borderRadius: 6 },
  full: { width: '100%' },
  fromLeft: { transformOrigin: 'left' },
  fromRight: { transformOrigin: 'right' },
});
