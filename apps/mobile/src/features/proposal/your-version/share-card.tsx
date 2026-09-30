/**
 * YOUR SHARE (3f-3, and the objection sheet's total): the member's share rolling on an odometer
 * with the donut beside it, and the savings the guide offered as toggles ("Skip the Nara day and
 * save $64"). Every number is the cost engine's; toggling re-counts the share on the phone.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Donut } from '@/ui/data/Donut';
import { Odometer } from '@/ui/data/Odometer';
import { Toggle } from '@/ui/inputs/Toggle';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { wholeMoney } from '../data/format';
import type { Saving } from '../data/savings';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['12'],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: th.space['14'] },
  grow: { flex: 1, gap: th.space['2'] },
  saving: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
}));

export interface ShareCardProps {
  readonly locale: string;
  readonly baseMinor: number;
  readonly currency: string;
  readonly savings: readonly Saving[];
  readonly chosen: readonly string[];
  readonly onToggle: (optionId: string, on: boolean) => void;
}

/** The share with the chosen savings taken. */
export function shareWith(
  baseMinor: number,
  savings: readonly Saving[],
  chosen: readonly string[],
): number {
  return savings.reduce((sum, s) => (chosen.includes(s.id) ? sum + s.deltaMinor : sum), baseMinor);
}

/** Whole currency units, the way the odometer rolls them. */
function wholeUnits(locale: string, minor: number, currency: string): number {
  const digits =
    new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return Math.round(minor / 10 ** digits);
}

export function ShareCard(props: ShareCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, currency } = props;
  const share = shareWith(props.baseMinor, props.savings, props.chosen);
  const units = wholeUnits(locale, share, currency);
  const symbol = wholeMoney(locale, 0, currency).replace(/[0-9\s.,]/gu, '');
  const saved = props.baseMinor - share;
  return (
    <View style={styles.card} testID="version-share">
      <View style={styles.top}>
        <Donut
          size={72}
          stroke={12}
          segments={[
            {
              label: t({ id: 'proposal.share.you', message: 'Your share' }),
              value: Math.max(share, 1),
              color: theme.semantic.state.info,
            },
            ...(saved > 0
              ? [
                  {
                    label: t({ id: 'proposal.share.saved', message: 'Saved' }),
                    value: saved,
                    color: theme.color.pink,
                  },
                ]
              : []),
          ]}
        />
        <View style={styles.grow}>
          <Text variant="eyebrow">{t({ id: 'proposal.share.title', message: 'Your share' })}</Text>
          <Odometer
            value={units}
            prefix={symbol}
            variant="h1"
            accessibilityLabel={t({ id: 'proposal.share.title', message: 'Your share' })}
            testID="version-share-amount"
          />
        </View>
      </View>
      {props.savings.map((saving) => {
        const on = props.chosen.includes(saving.id);
        const amount = wholeMoney(locale, Math.abs(saving.displayDeltaMinor), saving.currency);
        const label = t({
          id: 'proposal.share.skip',
          message: `Skip ${saving.label} and save ${amount}`,
        });
        return (
          <View key={saving.id} style={styles.saving}>
            <View style={styles.grow}>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {label}
              </Text>
            </View>
            <Toggle
              value={on}
              onValueChange={(next) => props.onToggle(saving.id, next)}
              label={label}
              testID={`version-saving-${saving.id}`}
            />
          </View>
        );
      })}
    </View>
  );
}
