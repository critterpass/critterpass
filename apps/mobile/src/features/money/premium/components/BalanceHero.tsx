/**
 * The Money hero. With expenses (7.17): a white card, "You're owed / You owe / All square" and the
 * amount rolling on the Smooth spring, with the crew-currency chip. Before the first expense (7.16):
 * the dark card, the crew's "$0.00" and everyone in it, nobody owing anyone yet.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Card, CrewStack, Text, usePremiumTheme, type CrewMember } from '@/ui/premium';

import type { HeroKind } from '../../balances/model';
import { formatAmount } from '../../format';
import { RollingAmount } from './RollingAmount';

export function BalanceHero(props: {
  readonly kind: HeroKind;
  readonly amountMinor: bigint;
  readonly currency: string;
  /** A crew of one: what was spent, nothing to split. */
  readonly solo: boolean;
  readonly onCurrency: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const label = props.solo
    ? t({ id: 'money.hero.soloSpent', message: 'Spent so far' })
    : props.kind === 'owed'
      ? t({ id: 'money.hero.owed', message: "You're owed" })
      : props.kind === 'owes'
        ? t({ id: 'money.hero.owes', message: 'You owe' })
        : t({ id: 'money.hero.square', message: 'All square' });
  const amount = formatAmount(props.amountMinor, props.currency, locale);
  return (
    <Card
      radius={th.radius.cardLarge}
      style={[styles.hero, { marginHorizontal: th.space.gutter }]}
      testID="money-hero"
    >
      <View style={styles.top}>
        <Text variant="label" tone="muted">
          {label}
        </Text>
        <Button
          label={`${props.currency} ⌄`}
          variant="floating"
          size="small"
          onPress={props.onCurrency}
          accessibilityHint={t({
            id: 'money.currency.switchHint',
            message: 'What the crew counts in',
          })}
          testID="money-currency-chip"
        />
      </View>
      <PrivateContent>
        <RollingAmount
          text={amount}
          variant={amount.length <= 9 ? 'hero' : 'display'}
          testID="money-hero-amount"
        />
      </PrivateContent>
    </Card>
  );
}

export function EmptyLedgerHero(props: {
  readonly crewName: string;
  readonly currency: string;
  readonly members: readonly CrewMember[];
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <View
      style={[
        styles.dark,
        {
          marginHorizontal: th.space.gap16,
          borderRadius: th.radius.hero,
          backgroundColor: th.color.inkSurface,
          boxShadow: th.shadow.ink,
          gap: th.space.gap8,
        },
      ]}
      testID="money-empty-hero"
    >
      <Text variant="label" color={th.color.onInkSurface} style={styles.soft}>
        {t({ id: 'money.premium.square', message: `${props.crewName} · you're square` })}
      </Text>
      <Text variant="hero" color={th.color.onInkSurface}>
        {formatAmount(0n, props.currency, locale)}
      </Text>
      <View style={styles.crew}>
        <CrewStack members={props.members} size={24} accessibilityLabel={props.crewName} />
        <Text variant="caption" color={th.color.onInkSurface} style={styles.soft}>
          {t({ id: 'money.premium.nobodyOwes', message: 'Nobody owes anyone yet' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: 18, paddingHorizontal: 20, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dark: { padding: 20, minHeight: 168, justifyContent: 'flex-end' },
  soft: { opacity: 0.85 },
  crew: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
