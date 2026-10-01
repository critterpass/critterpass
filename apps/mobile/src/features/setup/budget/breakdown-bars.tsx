/**
 * Where the sweet spot goes (3c-5): FLIGHTS, STAYS (with the stay mix), FOOD and FUN, each bar a
 * share of the target that re-flows as the knob moves and always sums to it. When nothing is
 * priced yet it says so instead of showing zeros, and when only the flights are not (dates too
 * near for a cached fare) it says that and splits the rest; while the synced prices load, a
 * skeleton.
 */
import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { LinearBar } from '@/ui/data/LinearBar';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { stayMixLine } from './labels';
import { money, type Bars } from './model';

const useStyles = makeStyles((th) => ({
  card: { padding: th.space['16'], gap: th.space['12'] },
}));

export type BarsState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready'; readonly bars: Bars };

export function BreakdownBars({
  state,
  target,
  currency,
}: {
  readonly state: BarsState;
  readonly target: number;
  readonly currency: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (state.kind === 'loading') {
    return (
      <Skeleton
        preset="card"
        label={t({ id: 'setup.budget.bars.loading', message: 'Pricing the trip' })}
        testID="budget-bars-loading"
      />
    );
  }
  if (state.kind === 'missing') {
    return (
      <Card style={styles.card} testID="budget-bars-missing">
        <Text variant="title">
          {t({ id: 'setup.budget.bars.missingTitle', message: 'No prices yet' })}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'setup.budget.bars.missingLine',
            message:
              'Flights and stays for these dates aren’t in yet. The split shows once they are.',
          })}
        </Text>
      </Card>
    );
  }
  const { bars } = state;
  const rows = [
    {
      key: 'flights',
      label: t({ id: 'setup.budget.bars.flights', message: 'Flights' }),
      value: bars.flights,
      color: theme.color.blue,
    },
    {
      key: 'stays',
      label: t({ id: 'setup.budget.bars.stays', message: 'Stays' }),
      value: bars.stays,
      color: theme.color.pink,
    },
    {
      key: 'food',
      label: t({ id: 'setup.budget.bars.food', message: 'Food' }),
      value: bars.food,
      color: theme.color.green.base,
    },
    {
      key: 'fun',
      label: t({ id: 'setup.budget.bars.fun', message: 'Fun' }),
      value: bars.fun,
      color: theme.color.orange,
    },
  ];
  const mix = bars.stayMix === null ? '' : stayMixLine(bars.stayMix);
  return (
    <Card style={styles.card} testID="budget-bars">
      {bars.flightsPriced ? null : (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          testID="budget-bars-no-flights"
        >
          {t({
            id: 'setup.budget.bars.noFlights',
            message:
              'Flights for these dates aren’t priced yet. This covers the stay, food and fun.',
          })}
        </Text>
      )}
      {rows
        .filter((row) => row.key !== 'flights' || bars.flightsPriced)
        .map((row, index) => (
          <Stack key={row.key} gap="4">
            <LinearBar
              label={row.label}
              value={row.value}
              max={Math.max(1, target)}
              color={row.color}
              valueLabel={money(locale, row.value, currency)}
              index={index}
              testID={`budget-bar-${row.key}`}
            />
            {row.key === 'stays' && mix !== '' ? (
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {mix}
              </Text>
            ) : null}
          </Stack>
        ))}
    </Card>
  );
}
