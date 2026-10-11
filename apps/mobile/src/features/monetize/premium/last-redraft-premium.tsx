/**
 * Last free redraft (9.18), the sheet's content for the plan lane to host in its own sheet: Pon,
 * the trip and which redraft this is, the used ones struck and the live one pulsing, then Use my
 * last one or Boost (unlimited). Redrafts reset every trip.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  PressableScale,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { MONETIZE_INK, MONETIZE_TIMING } from './monetize-palette';

export interface LastRedraftPremiumProps {
  readonly place: string;
  /** Redrafts this trip allows for free (3). */
  readonly limit: number;
  /** "$2 each" when a split boost would be shown; null to say just "unlimited". */
  readonly boostEach: string | null;
  readonly onUse: () => void;
  /** Absent while there is no paywall to open. */
  readonly onBoost?: () => void;
}

function LiveSegment() {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const k = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    k.set(withRepeat(withTiming(1, { duration: MONETIZE_TIMING.livePulse }), -1));
  }, [reduced, k]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - k.value),
    transform: [{ scaleY: 1 + 1.4 * k.value }, { scaleX: 1 + 0.15 * k.value }],
  }));
  return (
    <View style={styles.segment}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.round,
          { backgroundColor: th.accent.tangerine },
          ring,
        ]}
      />
      <View
        style={[StyleSheet.absoluteFill, styles.round, { backgroundColor: th.accent.tangerine }]}
      />
    </View>
  );
}

export function LastRedraftPremium({
  place,
  limit,
  boostEach,
  onUse,
  onBoost,
}: LastRedraftPremiumProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const used = limit - 1;
  return (
    <View style={{ gap: 14 }} testID="last-redraft">
      <View style={[styles.pon, { backgroundColor: MONETIZE_INK.ponDisc }]}>
        <CritterSticker kind="tanuki" name="Pon" size={64} pose="think" edge={false} />
      </View>
      <Text variant="badge" color={th.color.status.tangerine.text} style={styles.eyebrow}>
        {upper(
          t({
            id: 'monetize.premium.redraftEyebrow',
            message: `${place} · Redraft ${limit} of ${limit}`,
          }),
          locale,
        )}
      </Text>
      <Text variant="emptyTitle" style={styles.heavy} accessibilityRole="header">
        {t({ id: 'monetize.premium.redraftTitle', message: 'Last free redraft' })}
      </Text>
      <View
        style={styles.segments}
        accessible
        accessibilityLabel={t({
          id: 'monetize.premium.redraftLeft',
          message: `${used} of ${limit} used`,
        })}
      >
        {Array.from({ length: limit - 1 }, (_u, i) => (
          <View
            key={i}
            style={[styles.segment, styles.round, { backgroundColor: th.color.controlDisabled }]}
          >
            <View style={[styles.strike, { backgroundColor: th.color.outlineEmpty }]} />
          </View>
        ))}
        <LiveSegment />
      </View>
      <Text variant="rowText" tone="inkSecondary">
        {t({
          id: 'monetize.premium.redraftLine',
          message:
            'This is the last free one on this trip. Make it count, or boost for as many as the crew wants.',
        })}
      </Text>
      <Button
        label={t({ id: 'monetize.premium.redraftUse', message: 'Use my last one' })}
        onPress={onUse}
        testID="last-redraft-use"
      />
      {onBoost === undefined ? null : (
        <PressableScale
          onPress={onBoost}
          accessibilityLabel={t({
            id: 'planDraft.spent.boost',
            message: 'Boost for unlimited redrafts',
          })}
          style={[styles.boost, { boxShadow: `inset 0 0 0 2px ${th.accent.pink}` }]}
          testID="redraft-boost"
        >
          <Text variant="button" color={th.color.status.voteOpen.text} numberOfLines={1}>
            {boostEach === null
              ? t({ id: 'monetize.premium.redraftBoost', message: 'Boost · unlimited' })
              : t({
                  id: 'monetize.premium.redraftBoostEach',
                  message: `Boost · unlimited · ${boostEach} each`,
                })}
          </Text>
        </PressableScale>
      )}
      <Text variant="caption" tone="muted" align="center">
        {t({ id: 'planDraft.spent.reset', message: 'Redrafts reset every trip.' })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  eyebrow: { fontWeight: '800', letterSpacing: 1.1 },
  heavy: { fontWeight: '800' },
  segments: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, height: 10 },
  round: { borderRadius: 5, overflow: 'hidden' },
  strike: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: 4,
    height: 2,
    transform: [{ rotate: '-8deg' }],
  },
  boost: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
