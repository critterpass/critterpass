/**
 * The Money hero. With expenses (7.17): a white card, "You're owed / You owe / All square" and the
 * amount rolling on the Smooth spring, with the crew-currency chip. Before the first expense (7.16):
 * the dark card, the crew's "$0.00" and everyone in it, nobody owing anyone yet.
 */
import type { PremiumTypeName } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
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
          alignSelf="auto"
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
      <FittedAmount text={amount} />
    </Card>
  );
}

/** The hero's sizes, largest first: the amount takes the largest one that fits the card. */
const STEPS = ['hero', 'display', 'title'] as const satisfies readonly PremiumTypeName[];
type Step = (typeof STEPS)[number];

/**
 * The amount at the largest size that fits on one line ("−12.345.678 ₫" at large type steps down
 * from hero to display to title). Each size is measured once, unseen, against the card's width.
 */
function FittedAmount({ text }: { readonly text: string }) {
  const [space, setSpace] = useState(0);
  // A size's width follows the text: a new amount of the same width lays out no new width.
  const [widths, setWidths] = useState<Partial<Record<Step, number>>>({});
  const known = STEPS.every((step) => widths[step] !== undefined) && space > 0;
  const variant: Step = known
    ? (STEPS.find((step) => (widths[step] ?? Infinity) <= space) ?? 'title')
    : text.length <= 9
      ? 'hero'
      : 'display';
  return (
    <View onLayout={(event) => setSpace(Math.floor(event.nativeEvent.layout.width))}>
      <View style={styles.measures} pointerEvents="none" accessibilityElementsHidden>
        {STEPS.map((step) => (
          <Text
            key={step}
            variant={step}
            numberOfLines={1}
            style={styles.measure}
            importantForAccessibility="no"
            onLayout={(event) => {
              const width = Math.ceil(event.nativeEvent.layout.width);
              setWidths((current) => ({ ...current, [step]: width }));
            }}
          >
            {text}
          </Text>
        ))}
      </View>
      <PrivateContent>
        <RollingAmount text={text} variant={variant} testID="money-hero-amount" />
      </PrivateContent>
    </View>
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
  // Wide enough that no size wraps while it is measured.
  measures: { position: 'absolute', width: 2000, opacity: 0, alignItems: 'flex-start' },
  measure: { fontVariant: ['tabular-nums'] },
  hero: { paddingVertical: 18, paddingHorizontal: 20, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dark: { padding: 20, minHeight: 168, justifyContent: 'flex-end' },
  soft: { opacity: 0.85 },
  crew: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
