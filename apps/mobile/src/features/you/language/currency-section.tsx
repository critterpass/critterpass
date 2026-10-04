/**
 * CURRENCY on Language and currency (3n-8): the home currency (from the home airport unless the
 * person chose one), how prices show (HOME / LOCAL / BOTH) with a sample price beside Tokek, how
 * old the rates are when they are old or missing, and the note about balances.
 */
import type { PriceDisplayMode } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { I18nManager, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Segmented } from '@/ui/inputs/Segmented';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface CurrencySectionProps {
  /** "SGD · from your home airport"; null before there is a home currency at all. */
  readonly homeLine: string | null;
  /** "S$" */
  readonly homeSymbol: string | null;
  readonly onHomeCurrency: () => void;
  readonly mode: PriceDisplayMode;
  readonly onMode: (mode: PriceDisplayMode) => void;
  /** "Rp 75.000 ≈ S$6.40", in the chosen mode. */
  readonly sample: string;
  /** "Rates from Oct 2", shown only when they are old or missing. */
  readonly ratesLine: string | null;
}

const TOKEK = guideSticker('tokek');

const useStyles = makeStyles((t) => ({
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['12'],
  },
  body: { flex: 1, minWidth: 0, gap: t.space['2'] },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  mode: {
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['12'],
    gap: t.space['12'],
  },
  sample: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['10'],
  },
}));

export function CurrencySection(props: CurrencySectionProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const homeTitle = t({ id: 'you.currency.home', message: 'Home currency' });
  return (
    <Stack gap="8" testID="you-currency">
      <Text variant="eyebrow" accessibilityRole="header">
        {t({ id: 'you.currency.title', message: 'Currency' })}
      </Text>
      <View style={styles.group}>
        <PressScale
          onPress={props.onHomeCurrency}
          widthClass="wide"
          accessibilityRole="button"
          accessibilityLabel={[homeTitle, props.homeLine].filter(Boolean).join(', ')}
          style={styles.row}
          testID="you-currency-home"
        >
          <Stack gap="2" style={styles.body}>
            <Text variant="rowTitle">{homeTitle}</Text>
            <SecondaryText>
              {props.homeLine ??
                t({ id: 'you.currency.homeNone', message: 'Pick one, or set your home airport' })}
            </SecondaryText>
          </Stack>
          <Text variant="rowTitle" color={theme.semantic.action.primary}>
            {`${props.homeSymbol ?? ''} ${I18nManager.isRTL ? '‹' : '›'}`.trim()}
          </Text>
        </PressScale>
        <View style={styles.divider} />
        <View style={styles.mode}>
          <Row gap="12" align="center">
            <Text variant="rowTitle" style={{ flex: 1 }}>
              {t({ id: 'you.currency.showIn', message: 'Show prices in' })}
            </Text>
            <View style={{ flexShrink: 1, maxWidth: '62%' }}>
              <Segmented
                segments={[
                  { value: 'home', label: t({ id: 'you.currency.mode.home', message: 'Home' }) },
                  { value: 'local', label: t({ id: 'you.currency.mode.local', message: 'Local' }) },
                  { value: 'both', label: t({ id: 'you.currency.mode.both', message: 'Both' }) },
                ]}
                value={props.mode}
                onChange={props.onMode}
                label={t({ id: 'you.currency.showIn', message: 'Show prices in' })}
                testID="you-currency-mode"
              />
            </View>
          </Row>
          <Row gap="8" align="center">
            <Sticker kind={TOKEK.kind} name={TOKEK.name} size={32} />
            <View style={styles.sample} testID="you-currency-sample">
              <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
                {props.sample}
              </Text>
              <SecondaryText>
                {t({ id: 'you.currency.samplePlace', message: 'Tirta Empul' })}
              </SecondaryText>
            </View>
          </Row>
          {props.ratesLine === null ? null : (
            <SecondaryText testID="you-currency-rates">{props.ratesLine}</SecondaryText>
          )}
        </View>
      </View>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({
          id: 'you.currency.note',
          message: 'Balances split in the crew’s currency. Rates work offline.',
        })}
      </Text>
    </Stack>
  );
}
