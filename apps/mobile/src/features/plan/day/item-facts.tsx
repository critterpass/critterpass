/**
 * The facts on a stop's sheet under its time (design in code): who's going, what it costs, its
 * booking and the notes on it.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { displayWithHome, useMoneyDisplay } from '@/data/money';
import type { DayItem } from '@/data/plan/plan-model';
import type { PlanMember } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { money } from './format';

const useStyles = makeStyles((th) => ({
  label: { marginBottom: th.space['4'] },
}));

export function Section({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View>
      <Text variant="eyebrow" color={theme.semantic.text.secondary} style={styles.label}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * What the cost line can say: a price when there is one; "Free" only for a place known to be free
 * (its price level says so); "No estimate yet" for a place nobody has priced, never "Free"; and
 * nothing for a note with no place and no price.
 */
export function costKind(
  amountMinor: number | null,
  priceLevel: number | null,
  hasPlace: boolean,
): 'priced' | 'free' | 'unknown' | 'none' {
  if (amountMinor !== null && amountMinor > 0) return 'priced';
  if (priceLevel === 0) return 'free';
  return hasPlace || amountMinor === 0 ? 'unknown' : 'none';
}

export function ItemFacts({
  item,
  members,
  priceLevel = null,
}: {
  readonly item: DayItem;
  readonly members: readonly PlanMember[];
  /** The place's price level (0 = known to be free); null = not known. */
  readonly priceLevel?: number | null;
}) {
  const locale = useLocale();
  const { t } = useLingui();
  useMoneyDisplay();
  const shown = (minor: number, currency: string) =>
    displayWithHome(money(locale, minor, currency), minor, currency, locale);
  // A trip of one: no "each", no "everyone".
  const solo = members.length <= 1;
  const going = members.filter((member) => item.attendeeIds.includes(member.uid));
  const kind = costKind(item.amountMinor, priceLevel, item.poiId !== null);
  const cost =
    kind === 'none'
      ? null
      : kind === 'free'
        ? t({ id: 'plan.day.item.costFree', message: 'Free' })
        : kind === 'unknown' || item.amountMinor === null || item.currency === null
          ? t({ id: 'plan.day.item.costUnknown', message: 'No estimate yet' })
          : solo
            ? shown(item.amountMinor, item.currency)
            : item.costModel === 'per_person'
              ? t({
                  id: 'plan.day.item.costEach',
                  message: `${shown(item.amountMinor, item.currency)} each`,
                })
              : t({
                  id: 'plan.day.item.costGroup',
                  message: `${shown(item.amountMinor, item.currency)} for the group`,
                });
  return (
    <>
      <Section label={t({ id: 'plan.day.item.who', message: 'Who’s going' })}>
        {going.length === 0 ? (
          <Text variant="body">
            {solo
              ? t({ id: 'plan.day.item.justYou', message: 'Just you' })
              : t({ id: 'plan.day.item.everyone', message: 'Everyone' })}
          </Text>
        ) : (
          <Row gap="8" align="center">
            <AvatarStack
              members={going.map((member) => ({
                key: member.uid,
                name: member.name,
                joinIndex: member.joinIndex,
              }))}
              size="sm"
            />
            <Text variant="bodySm">{going.map((member) => member.name).join(', ')}</Text>
          </Row>
        )}
      </Section>
      {cost === null ? null : (
        <Section label={t({ id: 'plan.day.item.cost', message: 'Cost' })}>
          <Text variant="body">{cost}</Text>
        </Section>
      )}
      {item.bookingId === null ? null : (
        <Section label={t({ id: 'plan.day.item.booking', message: 'Booking' })}>
          <Text variant="body">
            {t({
              id: 'plan.day.item.bookingLine',
              message: 'Tickets and voucher are in Bookings.',
            })}
          </Text>
        </Section>
      )}
      {item.notes === null || item.notes === item.title ? null : (
        <Section label={t({ id: 'plan.day.item.notes', message: 'Notes' })}>
          <Text variant="body">{item.notes}</Text>
        </Section>
      )}
    </>
  );
}
