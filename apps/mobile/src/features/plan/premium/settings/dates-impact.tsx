/**
 * What new dates change (4.54): who is free on every day of them, then each booking (moves, we ask,
 * lost with what is kept back, or fine, as a coloured bar) and the plan's days that shift.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { DatesImpactResult } from '@cp/domain';

import { Card, CrewStack, ListCard, Text, usePremiumTheme, type CrewMember } from '@/ui/premium';
import { money } from '@/features/vote';

export function DatesImpact({
  data,
  faces,
  locale,
}: {
  readonly data: DatesImpactResult;
  readonly faces: readonly CrewMember[];
  readonly locale: string;
}) {
  const theme = usePremiumTheme();
  const free = data.free;
  const barColour = (kind: string) =>
    kind === 'moves'
      ? theme.accent.mint
      : kind === 'ask'
        ? theme.accent.sun
        : kind === 'lost'
          ? theme.accent.pink
          : theme.color.fieldBorder;
  const label = (kind: string) =>
    kind === 'moves'
      ? t({ id: 'plan.dates.moves', message: 'Moves' })
      : kind === 'ask'
        ? t({ id: 'plan.dates.ask', message: 'We ask' })
        : kind === 'lost'
          ? t({ id: 'plan.dates.lost', message: 'Lost' })
          : t({ id: 'plan.dates.fine', message: 'Fine' });
  return (
    <>
      <Card padded testID="change-dates-free">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
          <CrewStack
            members={faces}
            size={28}
            accessibilityLabel={faces.map((f) => f.name).join(', ')}
          />
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle">
              {t({
                id: 'plan.dates.free',
                message: `${free?.user_ids.length ?? 0} of ${free?.total ?? 0} are free`,
              })}
            </Text>
            <Text variant="captionMuted" tone="muted">
              {t({ id: 'plan.dates.freeLine', message: 'From the days everyone marked' })}
            </Text>
          </View>
        </View>
      </Card>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
        {t({ id: 'plan.dates.changes', message: 'What it changes' })}
      </Text>
      <ListCard>
        {data.bookings.map((booking) => (
          <View
            key={booking.booking_id}
            testID={`change-dates-booking-${booking.impact}`}
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.gap12,
              paddingHorizontal: theme.space.rowPadH,
            }}
          >
            <View
              style={{
                width: 4,
                height: 34,
                borderRadius: 2,
                backgroundColor: barColour(booking.impact),
              }}
            />
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle" numberOfLines={1}>
                {booking.title}
              </Text>
              {booking.impact === 'lost' &&
              booking.kept_minor !== null &&
              booking.currency !== null ? (
                <Text variant="captionMuted" tone="muted">
                  {t({
                    id: 'plan.dates.kept',
                    message: `Keeps ${money(locale, booking.kept_minor, booking.currency)}`,
                  })}
                </Text>
              ) : null}
            </View>
            <Text
              variant="captionMuted"
              color={
                booking.impact === 'lost' ? theme.color.destructive.text : theme.color.inkSecondary
              }
            >
              {label(booking.impact)}
            </Text>
          </View>
        ))}
        <View
          style={{
            minHeight: 60,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap12,
            paddingHorizontal: theme.space.rowPadH,
          }}
        >
          <View
            style={{
              width: 4,
              height: 34,
              borderRadius: 2,
              backgroundColor: data.stops_to_ideas > 0 ? theme.accent.sun : theme.accent.mint,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle">{t({ id: 'plan.dates.plan', message: 'The plan' })}</Text>
            <Text variant="captionMuted" tone="muted">
              {data.stops_to_ideas > 0
                ? t({
                    id: 'plan.dates.toIdeas',
                    message: `${data.days_moving} days shift, ${data.stops_to_ideas} stops go back to Ideas`,
                  })
                : t({
                    id: 'plan.dates.shift',
                    message: `${data.days_moving} days shift with the dates`,
                  })}
            </Text>
          </View>
        </View>
      </ListCard>
    </>
  );
}
