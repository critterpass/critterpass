/**
 * The destination's year at a glance (4.04): "Best in April" over twelve crowd bars (the cheapest
 * month in the guide's colour, a tapped month in ink) with month initials, and for the tapped
 * month how busy it is and what flying there costs from each home airport of the crew.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { displayWithHome, useMoneyDisplay } from '@/data/money';
import { formatSeen } from '@/data/travel-data/freshness';
import { Card, PressableScale, Skeleton, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { DestinationViewProps } from '../../components/destination-view';
import { estimateText, monthName } from '../../format';

type Months = NonNullable<DestinationViewProps['months']>;

const BAR_HEIGHT = 44;

export function MonthCard({
  months,
  accent,
}: {
  readonly months: Months;
  readonly accent: string;
}) {
  useMoneyDisplay();
  const theme = usePremiumTheme();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const best = months.bars.find((bar) => bar.role === 'cheapest') ?? null;
  const panel = months.panel;
  const month = panel === null ? '' : monthName(locale, panel.month, 'long');
  const bestMonth = best === null ? '' : monthName(locale, best.month, 'long');
  return (
    <Card padded testID="explore-months">
      <Text variant="bannerAction">
        {best === null
          ? t({ id: 'explore.months.title', message: 'When to go' })
          : t({
              id: 'explore.premium.months.best',
              message: `Best in ${bestMonth}`,
            })}
      </Text>
      <Text variant="caption" tone="muted">
        {t({ id: 'explore.months.subtitle', message: 'Crowds by month' })}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 3,
          height: BAR_HEIGHT,
          marginTop: theme.space.gap10,
        }}
      >
        {months.bars.map((bar) => {
          const on = months.selected === bar.month;
          return (
            <PressableScale
              key={bar.month}
              onPress={() => months.onSelect(bar.month)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={monthName(locale, bar.month)}
              testID={`explore-month-${String(bar.month)}`}
              style={{
                flex: 1,
                height: Math.max(6, bar.fraction * BAR_HEIGHT),
                borderRadius: 3,
                backgroundColor: on
                  ? theme.color.ink
                  : bar.role === 'cheapest'
                    ? accent
                    : theme.color.progressTodo,
              }}
            />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: theme.space.gap4 }}>
        {months.bars.map((bar) => (
          <Text
            key={bar.month}
            variant="badge"
            tone={bar.role === 'cheapest' ? 'ink' : 'placeholder'}
            align="center"
            style={{ flex: 1 }}
          >
            {monthName(locale, bar.month).slice(0, 1)}
          </Text>
        ))}
      </View>
      {panel === null ? null : (
        <View
          style={{ marginTop: theme.space.gap12, gap: theme.space.gap8 }}
          testID="explore-month-panel"
        >
          <Text variant="rowTextStrong">
            {panel.crowd === 'quiet'
              ? t({ id: 'explore.panel.quiet', message: 'One of the quieter months.' })
              : panel.crowd === 'busy'
                ? t({ id: 'explore.panel.busy', message: 'One of the busiest months.' })
                : t({ id: 'explore.panel.steady', message: 'A middling month for crowds.' })}
          </Text>
          {panel.prices.kind === 'loading' ? (
            <Skeleton height={40} radius={theme.radius.field} />
          ) : panel.prices.kind === 'noAirport' ? (
            <View style={{ alignItems: 'flex-start' }}>
              <Text variant="caption" tone="muted">
                {t({
                  id: 'explore.panel.noAirport',
                  message:
                    'Add your home airport to see what the flight costs from where you live.',
                })}
              </Text>
              {panel.onSetHomeAirport === undefined ? null : (
                <TextButton
                  label={t({ id: 'explore.panel.setAirport', message: 'Set home airport' })}
                  onPress={panel.onSetHomeAirport}
                />
              )}
            </View>
          ) : panel.prices.kind === 'unavailable' ? (
            <Text variant="caption" tone="muted">
              {t({
                id: 'explore.panel.unavailable',
                message: `No fares to show for ${month} right now. Try again in a bit.`,
              })}
            </Text>
          ) : (
            panel.prices.rows.map((row) => {
              const amount =
                row.price === null
                  ? null
                  : displayWithHome(
                      estimateText(locale, row.price.minor, row.price.currency),
                      row.price.minor,
                      row.price.currency,
                      locale,
                    );
              const who = [
                ...(row.mine ? [t({ id: 'explore.panel.you', message: 'You' })] : []),
                ...row.names,
              ].join(', ');
              const seen = row.seenAt === null ? null : formatSeen(row.seenAt, new Date(), locale);
              return (
                <View key={row.origin} style={{ flexDirection: 'row', gap: theme.space.gap10 }}>
                  <Text variant="rowTextStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {`${row.origin} · ${who}`}
                  </Text>
                  <Text variant="rowText" testID={`explore-month-price-${row.origin}`}>
                    {amount === null
                      ? t({ id: 'explore.panel.noFare', message: 'No fare seen' })
                      : t({ id: 'explore.panel.each', message: `~${amount} each` })}
                  </Text>
                  {seen === null ? null : (
                    <Text variant="captionMuted" tone="muted">
                      {t({ id: 'explore.panel.seen', message: `seen ${seen}` })}
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </Card>
  );
}
