/**
 * The paywall's boost row and plan tiles (9.10), on the night ground.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon, PressableScale, Tag, Text, usePremiumTheme } from '@/ui/premium';

import type { BillingPeriod } from '../paywall/paywall-model';
import type { PerkLine } from '../perks/perk-copy';
import { InkStamp } from './components/ink-stamp';
import { NIGHT, NightGlass } from './components/night';

export function BoostRow({
  place,
  perks,
  price,
  onPress,
  disabled,
}: {
  readonly place: string;
  readonly perks: readonly PerkLine[];
  readonly price: string;
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const line = perks.map((perk) => i18n._(perk.copy)).join(', ');
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={t({
        id: 'monetize.premium.paywall.boostLabel',
        message: `Trip boost, ${price} for the crew`,
      })}
      testID="paywall-boost-stamp"
    >
      <NightGlass style={styles.boost}>
        <InkStamp
          word={upper(t({ id: 'monetize.compare.boost', message: 'Boost' }), locale)}
          ink={th.accent.pink}
          text={NIGHT.boostText}
          size={52}
          wordSize={11}
          rotate={-10}
        />
        <View style={styles.flex}>
          <Text variant="rowTitle" color={NIGHT.text} numberOfLines={1}>
            {t({ id: 'monetize.premium.boostRow', message: `Or boost ${place} for the crew` })}
          </Text>
          <Text variant="caption" color={NIGHT.textMuted} numberOfLines={1}>
            {line === '' ? price : `${price} · ${line}`}
          </Text>
        </View>
        <Icon name="forward" size={18} color={NIGHT.textMuted} />
      </NightGlass>
    </PressableScale>
  );
}

export function PlanTiles({
  period,
  monthly,
  yearly,
  saving,
  onPeriod,
}: {
  readonly period: BillingPeriod;
  readonly monthly: string;
  readonly yearly: string;
  readonly saving: number | null;
  readonly onPeriod: (period: BillingPeriod) => void;
}) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const tile = (value: BillingPeriod, label: string, price: string) => {
    const on = period === value;
    return (
      <PressableScale
        key={value}
        onPress={() => onPeriod(value)}
        accessibilityRole="radio"
        accessibilityLabel={`${label}, ${price}`}
        accessibilityState={{ selected: on }}
        style={styles.flex}
        testID={`paywall-period-${value}`}
      >
        <NightGlass
          style={[
            styles.tile,
            on
              ? { backgroundColor: NIGHT.selectedFill, boxShadow: `inset 0 0 0 2px ${NIGHT.sun}` }
              : null,
          ]}
        >
          <Text variant="caption" color={on ? NIGHT.gold : NIGHT.textMuted}>
            {label}
          </Text>
          <Text variant="headline" color={NIGHT.text} numberOfLines={1}>
            {price}
          </Text>
          {value === 'yearly' && saving !== null ? (
            <View style={styles.save}>
              <Tag
                label={upper(
                  t({ id: 'monetize.premium.save', message: `Save ${saving}%` }),
                  locale,
                )}
                color={th.accent.mint}
                rotate={6}
              />
            </View>
          ) : null}
        </NightGlass>
      </PressableScale>
    );
  };
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup" testID="paywall-period">
      {tile('monthly', t({ id: 'monetize.paywall.monthly', message: 'Monthly' }), monthly)}
      {tile('yearly', t({ id: 'monetize.paywall.yearly', message: 'Yearly' }), yearly)}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  boost: {
    height: 74,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { height: 60, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  save: { position: 'absolute', right: -4, top: -12 },
});
