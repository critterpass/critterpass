/**
 * What's in each (9.11): the free, Pass+ and Boost columns on one card with the Pass+ column lit,
 * a gold Pass+ button and a pink-outlined Boost button. Prices are the store's own.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { useCompareScreen } from '../compare/use-compare-screen';
import type { CompareCell } from '../perks/perk-copy';
import { DrawnPage } from './components/drawn-page';
import { GoldButton } from './components/gold-button';
import { PurchaseFooter } from './components/purchase-footer';
import { MONETIZE_INK } from './monetize-palette';

export function ComparePremium() {
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const props = useCompareScreen();
  const { model } = props;
  const { phase, offer, boost } = model;
  const busy = phase === 'purchasing' || phase === 'verifying' || phase === 'loading';
  const cell = (value: CompareCell): string =>
    value.kind === 'text'
      ? i18n._(value.copy)
      : value.kind === 'yes'
        ? t({ id: 'monetize.compare.yes', message: '✓' })
        : t({ id: 'monetize.compare.no', message: '–' });
  const heads = [
    {
      label: upper(t({ id: 'monetize.compare.free', message: 'Free' }), locale),
      color: th.color.muted,
    },
    {
      label: upper(t({ id: 'monetize.compare.pass', message: 'Pass+' }), locale),
      color: th.color.status.maybe.text,
    },
    {
      label: upper(t({ id: 'monetize.compare.boost', message: 'Boost' }), locale),
      color: th.color.status.voteOpen.text,
    },
  ];
  return (
    <DrawnPage
      backLabel={t({ id: 'monetize.premium.back', message: 'Back' })}
      title={t({ id: 'monetize.compare.title', message: 'What’s in each' })}
      testID="compare"
      footer={
        <>
          {phase === 'subscribed' ? (
            <Text variant="rowTitle" align="center">
              {t({ id: 'monetize.compare.havePass', message: 'You have Pass+' })}
            </Text>
          ) : (
            <View style={styles.buttons}>
              <View style={styles.flex}>
                <GoldButton
                  label={
                    offer === null
                      ? t({ id: 'monetize.compare.pass', message: 'Pass+' })
                      : `${t({ id: 'monetize.compare.pass', message: 'Pass+' })} · ${offer.priceString}`
                  }
                  onPress={phase === 'verify_failed' ? props.onCheckAgain : props.onBuy}
                  loading={busy}
                  disabled={phase !== 'verify_failed' && !model.canBuy}
                  testID="compare-buy-pass"
                />
              </View>
              {props.canBoost && boost !== null ? (
                <PressableScale
                  onPress={props.onBoost}
                  disabled={busy}
                  style={[
                    styles.flex,
                    styles.boost,
                    {
                      boxShadow: `inset 0 0 0 2px ${th.accent.pink}`,
                      backgroundColor: th.color.card,
                    },
                  ]}
                  accessibilityLabel={`${t({ id: 'monetize.compare.boost', message: 'Boost' })} · ${boost.priceString}`}
                  testID="compare-boost"
                >
                  <Text variant="button" color={th.color.status.voteOpen.text} numberOfLines={1}>
                    {`${t({ id: 'monetize.compare.boost', message: 'Boost' })} · ${boost.priceString}`}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          )}
          {phase === 'subscribed' ? null : (
            <PurchaseFooter
              kind="subscription"
              phase={phase}
              price={offer?.priceString}
              period={model.period}
              store={props.store}
              onTerms={props.onTerms}
              onPrivacy={props.onPrivacy}
              testID="compare-disclosure"
            />
          )}
        </>
      }
    >
      <View style={{ paddingHorizontal: 4, gap: 6 }}>
        <Text variant="emptyTitle" style={styles.title}>
          {t({ id: 'monetize.premium.compareTitle', message: 'Free already does most of it' })}
        </Text>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'monetize.premium.compareLine',
            message: 'Pass+ is for you, on every crew. A boost is one trip, for the whole crew.',
          })}
        </Text>
      </View>
      <Card radius={22} style={styles.table} testID="compare-table">
        <View
          style={[
            styles.band,
            {
              backgroundColor:
                th.scheme === 'dark' ? MONETIZE_INK.passBandDark : MONETIZE_INK.passBand,
            },
          ]}
        />
        <View style={[styles.row, styles.head]}>
          <View style={styles.label} />
          {heads.map((head) => (
            <Text
              key={head.label}
              variant="badge"
              color={head.color}
              align="center"
              style={styles.col}
            >
              {head.label}
            </Text>
          ))}
        </View>
        {props.rows.map((row) => (
          <View
            key={row.id}
            style={[
              styles.row,
              { borderTopWidth: th.size.hairline, borderTopColor: th.color.hairline },
            ]}
          >
            <Text variant="caption" style={[styles.label, styles.rowLabel]}>
              {i18n._(row.label)}
            </Text>
            {row.cells.map((value, i) => (
              <Text
                key={i}
                variant="caption"
                align="center"
                color={value.kind === 'no' ? th.color.outlineEmpty : th.color.ink}
                style={[styles.col, i === 1 ? styles.bold : null]}
              >
                {cell(value)}
              </Text>
            ))}
          </View>
        ))}
      </Card>
    </DrawnPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontWeight: '800' },
  table: { overflow: 'hidden', paddingBottom: 6 },
  band: { position: 'absolute', top: 6, bottom: 6, left: '57%', width: '21%', borderRadius: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  head: { minHeight: 40 },
  label: { flex: 1.65 },
  col: { flex: 1 },
  bold: { fontWeight: '700' },
  rowLabel: { fontWeight: '600' },
  buttons: { flexDirection: 'row', gap: 10 },
  boost: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
