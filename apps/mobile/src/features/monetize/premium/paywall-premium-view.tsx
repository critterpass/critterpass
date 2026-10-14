/**
 * Pass+ paywall (9.10) on the night ground: ✕ and the entry's context chip, Restore, the headline,
 * the visa (with the first-trip-free stamp when it covers this person), the boost row, the two
 * plan tiles, the gold button and the ways out. Purchases stay in the store's own sheet.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { mrzLine } from '@/lib/documents/mrz';
import {
  GlassIconButton,
  REDUCED_FADE,
  SPRINGS,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { useScreenInsets } from '@/ui/premium/shell';

import type { PaywallViewProps } from '../paywall/paywall-props';
import { entryPointOf } from '../paywall/use-paywall-record';
import { useRestoreLine } from '../paywall/purchase-lines';
import { GoldButton } from './components/gold-button';
import { InkStamp } from './components/ink-stamp';
import { HeadlineSparkles, NIGHT, NightGround } from './components/night';
import { PurchaseFooter } from './components/purchase-footer';
import { StampSlam } from './components/stamp-slam';
import { VisaCard } from './components/visa-card';
import { EntryChip } from './entry-chip';
import { BoostRow, PlanTiles } from './paywall-parts';
import { PAPER } from './monetize-palette';

/** The paywall from props, so its states can be shown without a store. */
export function PaywallPremiumView({
  props,
  dismiss,
}: {
  readonly props: PaywallViewProps;
  readonly dismiss: () => void;
}) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const insets = useScreenInsets();
  const reduced = usePremiumReducedMotion();
  const params = useLocalSearchParams<{ entry?: string }>();
  const restoreLine = useRestoreLine()(props.restore);
  const { model } = props;
  const { offer, monthly, yearly, boost, phase } = model;
  const holder = props.holder.trim();
  const subscribed = phase === 'subscribed';
  const busy = phase === 'purchasing' || phase === 'verifying' || phase === 'loading';
  const [landed, setLanded] = useState(false);
  const [lineEnd, setLineEnd] = useState<number | null>(null);
  const boostPlace = props.boostTrip?.name ?? '';

  // The page steps in, the visa drops (Smooth), then the stamp lands (Lively).
  const drop = useSharedValue(0);
  useEffect(() => {
    drop.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.smooth));
    const timer = setTimeout(() => setLanded(true), reduced ? 0 : 420);
    return () => clearTimeout(timer);
  }, [drop, reduced]);
  const visaIn = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: reduced ? 0 : -40 * (1 - drop.value) }],
  }));

  const price = offer?.priceString ?? null;
  const perMonth = yearly?.perMonthString ?? null;
  const buyLabel =
    price === null
      ? t({ id: 'monetize.paywall.get', message: 'Get Pass+' })
      : model.period === 'monthly'
        ? t({ id: 'monetize.premium.getMonthly', message: `Get Pass+ · ${price} a month` })
        : t({ id: 'monetize.premium.getYearly', message: `Get Pass+ · ${price} a year` });

  return (
    <NightGround sparkles={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 72, paddingBottom: insets.bottom + 24 },
        ]}
        testID="paywall"
      >
        <View>
          <Text
            variant="display"
            color={NIGHT.text}
            style={styles.headline}
            accessibilityRole="header"
            onTextLayout={(event) =>
              setLineEnd(Math.max(0, ...event.nativeEvent.lines.map((line) => line.x + line.width)))
            }
          >
            {t({ id: 'monetize.paywall.headline', message: 'Go further\nthan free' })}
          </Text>
          <HeadlineSparkles lineEnd={lineEnd} />
        </View>
        <Animated.View style={visaIn}>
          <VisaCard
            title={t({ id: 'monetize.paywall.passPlus', message: 'Pass+' })}
            header={upper(
              t({ id: 'monetize.paywall.visaEyebrow', message: 'Visa · For you · Pour vous' }),
              locale,
            )}
            page={t({ id: 'monetize.paywall.page', message: 'PAGE 07' })}
            price={price}
            priceNote={
              model.period === 'monthly'
                ? t({ id: 'monetize.paywall.aMonth', message: 'A month' })
                : perMonth === null
                  ? t({ id: 'monetize.paywall.aYear', message: 'A year' })
                  : t({ id: 'monetize.paywall.aYearPerMonth', message: `A year · ${perMonth}/mo` })
            }
            fields={[
              [t({ id: 'monetize.paywall.holder', message: 'Holder' }), holder],
              [
                t({ id: 'monetize.paywall.entries', message: 'Entries' }),
                t({ id: 'monetize.paywall.unlimited', message: 'Unlimited' }),
              ],
              [
                t({ id: 'monetize.paywall.valid', message: 'Valid' }),
                model.period === 'monthly'
                  ? t({ id: 'monetize.paywall.validMonth', message: '1 month' })
                  : t({ id: 'monetize.paywall.validYear', message: '12 months' }),
              ],
              [
                t({ id: 'monetize.paywall.worksIn', message: 'Works in' }),
                t({ id: 'monetize.paywall.everyCrew', message: 'Every crew' }),
              ],
            ]}
            mrz={mrzLine(['V', 'CPPASS', 'PLUS', holder])}
            height={262}
            iconLabel={t({ id: 'monetize.premium.stampIcon', message: 'The Stamp app icon' })}
            accessibilityLabel={
              price === null
                ? t({ id: 'monetize.paywall.visaLabel', message: `Pass+ visa, holder ${holder}` })
                : t({
                    id: 'monetize.premium.paywall.visaLabelPriced',
                    message: `Pass+ visa, ${price}, holder ${holder}`,
                  })
            }
            testID="paywall-visa"
          >
            {props.firstTripFree === null ? null : (
              <View style={styles.ftf} pointerEvents="none">
                <StampSlam play={landed} rotate={9} from={2} fall={60} spin={-20}>
                  <InkStamp
                    word={upper(
                      t({ id: 'monetize.paywall.firstTripFree', message: 'First trip free' }),
                      locale,
                    )}
                    top={upper(props.firstTripFree.crew, locale)}
                    bottom={upper(props.firstTripFree.until, locale)}
                    ink={th.color.tier.rare}
                    fill={PAPER.showThroughStrong}
                    shape="rect"
                    size={150}
                    height={78}
                    wordSize={15}
                    testID="paywall-first-trip-free"
                  />
                </StampSlam>
              </View>
            )}
          </VisaCard>
        </Animated.View>
        {props.boostTrip !== null && boost !== null ? (
          <BoostRow
            place={props.boostTrip.name}
            perks={props.boostPerks}
            price={boost.priceString}
            onPress={props.onBoost}
            disabled={busy}
          />
        ) : null}
        {!subscribed && monthly !== null && yearly !== null ? (
          <PlanTiles
            period={model.period}
            monthly={monthly.priceString}
            yearly={yearly.priceString}
            saving={yearly.savingsPercent}
            onPeriod={props.onPeriod}
          />
        ) : null}
        <Text variant="caption" color={NIGHT.textMuted} align="center">
          {t({
            id: 'monetize.premium.critters',
            message: 'Critters are never for sale. You earn every one.',
          })}
        </Text>
        {subscribed ? (
          <GoldButton
            label={t({ id: 'monetize.paywall.yourPlan', message: 'You have Pass+ · Your plan' })}
            onPress={props.onPlan}
            testID="paywall-plan"
          />
        ) : phase === 'verify_failed' ? (
          <GoldButton
            label={t({ id: 'monetize.paywall.checkAgain', message: 'Check again' })}
            onPress={props.onCheckAgain}
            testID="paywall-check-again"
          />
        ) : (
          <GoldButton
            label={buyLabel}
            onPress={props.onBuy}
            loading={busy}
            disabled={!model.canBuy}
            testID="paywall-buy"
          />
        )}
        <View style={styles.links}>
          {props.boostTrip !== null && boost !== null ? (
            <TextButton
              label={t({
                id: 'monetize.premium.boostInstead',
                message: `Boost ${boostPlace} instead`,
              })}
              color={NIGHT.textSoft}
              onPress={props.onBoost}
              disabled={busy}
              testID="paywall-boost-instead"
            />
          ) : null}
          <TextButton
            label={t({ id: 'monetize.paywall.compare', message: 'What’s in each ›' })}
            color={NIGHT.textSoft}
            onPress={props.onCompare}
            disabled={busy}
            testID="paywall-compare"
          />
        </View>
        {restoreLine === null ? null : (
          <Text
            variant="caption"
            color={NIGHT.textSoft}
            align="center"
            accessibilityLiveRegion="polite"
            testID="paywall-restore-line"
          >
            {restoreLine}
          </Text>
        )}
        {subscribed ? null : (
          <PurchaseFooter
            kind="subscription"
            phase={phase}
            price={price ?? undefined}
            period={model.period}
            store={props.store}
            onTerms={props.onTerms}
            onPrivacy={props.onPrivacy}
            color={NIGHT.textMuted}
            testID="paywall-disclosure"
          />
        )}
      </ScrollView>
      <View style={[styles.top, { top: insets.top + 6 }]}>
        <GlassIconButton
          icon="close"
          kind="clear"
          label={t({ id: 'monetize.premium.close', message: 'Close' })}
          onPress={dismiss}
          testID="paywall-close"
        />
        <View style={styles.chip}>
          <EntryChip entry={entryPointOf(params.entry)} />
        </View>
        {subscribed ? null : (
          <TextButton
            label={t({ id: 'monetize.disclosure.restore', message: 'Restore' })}
            color={NIGHT.textSoft}
            onPress={props.onRestore}
            testID="paywall-restore"
          />
        )}
      </View>
    </NightGround>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, gap: 16 },
  headline: { fontWeight: '800' },
  ftf: { position: 'absolute', left: 150, top: 168 },
  // The links keep clear of the disclosure lines under them.
  links: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 8 },
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: { flex: 1, alignItems: 'flex-start' },
});
