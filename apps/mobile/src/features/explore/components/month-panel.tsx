/**
 * The chosen month, priced for the crew: one row per home airport with who flies from it and the
 * cheapest return fare seen (in the viewer's currency, with how long ago it was seen), under a
 * line on how busy the month is. Says so plainly while prices load, when none were seen, when the
 * viewer has no home airport yet, and when the prices on screen are a saved copy.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { formatSeen } from '@/data/travel-data/freshness';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { guideWritten } from '../data/guide-text';
import type { PriceRow } from '../destination-model';
import { monthName, moneyText } from '../format';

export type MonthPrices =
  | { readonly kind: 'loading' }
  | { readonly kind: 'noAirport' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rows'; readonly rows: readonly PriceRow[]; readonly offline: boolean };

export interface MonthPanelProps {
  /** 1–12. */
  readonly month: number;
  readonly crowd: 'quiet' | 'steady' | 'busy';
  readonly highlight: string | null;
  readonly prices: MonthPrices;
  /** Opens where the home airport is set; absent while that screen is not in the app. */
  readonly onSetHomeAirport?: (() => void) | undefined;
  readonly now?: Date;
}

const useStyles = makeStyles((t) => ({
  panel: {
    borderTopWidth: 1,
    borderTopColor: t.color.divider,
    paddingTop: t.space['12'],
    gap: t.space['10'],
  },
  fare: { gap: t.space['2'] },
}));

function useWho(): (row: PriceRow) => string {
  const { t } = useLingui();
  return (row) => {
    const people = [
      ...(row.mine ? [t({ id: 'explore.panel.you', message: 'You' })] : []),
      ...row.names,
    ];
    const others = row.others;
    if (others > 0) {
      people.push(
        people.length === 0
          ? t({ id: 'explore.panel.crewCount', message: `${others} of the crew` })
          : t({ id: 'explore.panel.moreCount', message: `+${others}` }),
      );
    }
    return people.length === 0 ? row.origin : `${row.origin} · ${people.join(', ')}`;
  };
}

export function MonthPanel(props: MonthPanelProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const who = useWho();
  const now = props.now ?? new Date();
  const month = monthName(locale, props.month, 'long');
  const crowd =
    props.crowd === 'quiet'
      ? t({ id: 'explore.panel.quiet', message: 'One of the quieter months.' })
      : props.crowd === 'busy'
        ? t({ id: 'explore.panel.busy', message: 'One of the busiest months.' })
        : t({ id: 'explore.panel.steady', message: 'A middling month for crowds.' });
  const { prices } = props;
  return (
    <View style={styles.panel} testID="explore-month-panel">
      <View style={{ gap: theme.space['2'] }}>
        <Text variant="title">{upper(month, locale)}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {props.highlight === null ? crowd : `${guideWritten(props.highlight, locale)} · ${crowd}`}
        </Text>
      </View>
      {prices.kind === 'loading' ? (
        <Skeleton
          preset="lines"
          label={t({ id: 'explore.panel.loading', message: 'Checking fares' })}
          testID="explore-month-loading"
        />
      ) : prices.kind === 'noAirport' ? (
        <View style={{ gap: theme.space['4'] }} testID="explore-month-no-airport">
          <Text variant="bodySm">
            {t({
              id: 'explore.panel.noAirport',
              message: 'Add your home airport to see what the flight costs from where you live.',
            })}
          </Text>
          {props.onSetHomeAirport === undefined ? null : (
            <TextLink
              label={t({ id: 'explore.panel.setAirport', message: 'Set home airport' })}
              onPress={props.onSetHomeAirport}
              testID="explore-month-set-airport"
            />
          )}
        </View>
      ) : prices.kind === 'unavailable' ? (
        <Text variant="bodySm" testID="explore-month-unavailable">
          {t({
            id: 'explore.panel.unavailable',
            message: `No fares to show for ${month} right now. Try again in a bit.`,
          })}
        </Text>
      ) : (
        <View style={{ gap: theme.space['10'] }} testID="explore-month-prices">
          {prices.rows.map((row) => {
            const seen = row.seenAt === null ? null : formatSeen(row.seenAt, now, locale);
            const amount =
              row.price === null ? null : moneyText(locale, row.price.minor, row.price.currency);
            return (
              <View key={row.origin} style={styles.fare}>
                <Text variant="rowTitle">{who(row)}</Text>
                {/* The amount gets a line of its own under who flies: a long amount in đồng and a
                    long name never squeeze each other into a ragged wrap. */}
                <Row justify="space-between" align="baseline" gap="12" wrap>
                  <Text variant="monoData" testID={`explore-month-price-${row.origin}`}>
                    {amount === null
                      ? t({ id: 'explore.panel.noFare', message: 'No fare seen' })
                      : t({ id: 'explore.panel.each', message: `~${amount} each` })}
                  </Text>
                  {seen === null ? null : (
                    <Text variant="caption" color={theme.semantic.text.secondary}>
                      {t({ id: 'explore.panel.seen', message: `seen ${seen}` })}
                    </Text>
                  )}
                </Row>
              </View>
            );
          })}
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {prices.offline
              ? t({
                  id: 'explore.panel.offline',
                  message: "You're offline. These are the last prices this phone saw.",
                })
              : t({
                  id: 'explore.panel.footnote',
                  message: 'Cheapest return fares seen, from each home airport.',
                })}
          </Text>
        </View>
      )}
    </View>
  );
}
