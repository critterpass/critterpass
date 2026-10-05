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

export function ItemFacts({
  item,
  members,
}: {
  readonly item: DayItem;
  readonly members: readonly PlanMember[];
}) {
  const locale = useLocale();
  const { t } = useLingui();
  useMoneyDisplay();
  const shown = (minor: number, currency: string) =>
    displayWithHome(money(locale, minor, currency), minor, currency, locale);
  const going = members.filter((member) => item.attendeeIds.includes(member.uid));
  const cost =
    item.amountMinor === null || item.currency === null
      ? null
      : item.amountMinor === 0
        ? // A stop with nothing to pay (a temple, a beach, a walk) says so, never "SGD 0 each".
          t({ id: 'plan.day.item.costFree', message: 'Free' })
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
          <Text variant="body">{t({ id: 'plan.day.item.everyone', message: 'Everyone' })}</Text>
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
