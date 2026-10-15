/**
 * The budget (7.29): spent against the crew's plan, large, with "$86 over" or what is left, a bar
 * that fills in ink to the plan and runs on in pink past it, and the pace ("Heading for $220
 * over"). Where it went, by category, with each one's difference from its plan. The guide names
 * the biggest cost still to come. An organiser sets or raises the budget in place (online only).
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { amountText, digitsToMinor } from '@/data/money/amount-digits';
import { useWalletGuide, WalletGuideProvider } from '@/features/bookings';
import { guideCritterKind } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, GuideNote, Skeleton, Text, TextField, usePremiumTheme } from '@/ui/premium';
import {
  KeyboardAwareScroll,
  KeyboardStickyFooter,
  PushScreen,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
} from '@/ui/premium/shell';

import { useBudget, type BudgetState } from '../budget/use-budget';
import { BudgetCategories } from './components/BudgetCategories';
import { BudgetSummary } from './components/BudgetSummary';

type Ready = Extract<BudgetState, { kind: 'ready' }>;

/** The iOS navigation bar's title row under the status bar. */
const IOS_BAR_HEIGHT = 44;

function Body({ budget }: { readonly budget: Ready }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  // Clears the home indicator with the keyboard down, and sits a gap above the keyboard when up.
  const footerPad = Math.max(insets.bottom, th.space.gap12);
  // The page brings its own scroll (it rides the keyboard), so it grounds its own top: under the
  // transparent iOS bar the status bar and the title row go solid, then fade; under the drawn
  // Android bar only the fade. Without it the hero's figures ran behind the title.
  const bar = Platform.OS === 'ios' ? insets.top + IOS_BAR_HEIGHT : 0;
  const edges = useScrollEdges({ topAfter: -bar });
  const { t } = useLingui();
  const locale = useLocale();
  const guide = useWalletGuide();
  const [setting, setSetting] = useState(false);
  const [digits, setDigits] = useState('');
  const amount = digitsToMinor(digits, budget.currency, 'whole');
  const { currency } = budget;
  const biggest = budget.forecast.biggest?.label ?? null;
  const hasPlan = budget.forecast.plannedMinor !== null;
  return (
    <>
      <View style={styles.page}>
        <KeyboardAwareScroll
          {...edges.scrollProps}
          bottomOffset={th.size.button + th.space.gap12 + th.space.gap16}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, gap: th.space.gap16 }}
        >
          <BudgetSummary budget={budget} />
          <BudgetCategories budget={budget} />
          {biggest === null ? null : (
            <View style={{ paddingHorizontal: th.space.gap16 }}>
              <GuideNote
                name={guide.name}
                critter={guideCritterKind(guide.id)}
                text={t({
                  id: 'money.budget.biggest',
                  message: `${biggest} is the biggest cost left.`,
                })}
              />
            </View>
          )}
          {setting ? (
            <View style={{ paddingHorizontal: th.space.gutter }}>
              <TextField
                accessibilityLabel={t({
                  id: 'money.budget.target',
                  message: `Crew total in ${currency}`,
                })}
                placeholder={amountText('0', budget.currency, locale, 'whole')}
                value={digits === '' ? '' : amountText(digits, budget.currency, locale, 'whole')}
                onChangeText={(text) => setDigits(text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                autoFocus
                helper={t({ id: 'money.budget.target', message: `Crew total in ${currency}` })}
                testID="money-budget-target"
              />
            </View>
          ) : null}
        </KeyboardAwareScroll>
        <ScrollEdgeFade
          edge="top"
          height={bar + SCROLL_EDGE_FADE}
          solid={bar}
          visible={edges.top}
        />
      </View>
      {budget.organiser ? (
        <KeyboardStickyFooter openedOffset={th.space.gap12 - footerPad}>
          <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: footerPad }}>
            {setting ? (
              <Button
                label={t({ id: 'money.payout.save', message: 'Save' })}
                disabled={amount <= 0n}
                loading={budget.saving}
                onPress={() =>
                  void budget.saveTarget(amount).then((done) => {
                    if (done) setSetting(false);
                  })
                }
                testID="money-budget-save"
              />
            ) : (
              <Button
                label={
                  hasPlan
                    ? t({ id: 'money.premium.raiseBudget', message: 'Change the budget' })
                    : t({ id: 'money.budget.set', message: 'Set a crew budget' })
                }
                variant={hasPlan ? 'secondary' : 'primary'}
                onPress={() => setSetting(true)}
                testID="money-budget-set"
              />
            )}
          </View>
        </KeyboardStickyFooter>
      ) : null}
    </>
  );
}

export function BudgetPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const budget = useBudget();
  const backLabel = t({ id: 'money.back', message: 'Money' });
  const title = t({ id: 'money.premium.budgetTitle', message: 'Budget' });
  if (budget.kind !== 'ready') {
    return (
      <PushScreen title={title} backLabel={backLabel} testID={`money-budget-${budget.kind}`}>
        {budget.kind === 'loading' ? (
          <View style={{ padding: th.space.gutter }}>
            <Skeleton height={200} radius={th.radius.cardLarge} />
          </View>
        ) : (
          <Text variant="body" tone="muted" align="center">
            {t({ id: 'money.premium.budgetNoTrip', message: 'A budget belongs to a trip.' })}
          </Text>
        )}
      </PushScreen>
    );
  }
  const day = budget.today;
  const { days } = budget;
  const when =
    day === 0
      ? t({ id: 'money.budget.before', message: 'Before the trip' })
      : day > budget.days
        ? t({ id: 'money.budget.after', message: 'Trip over' })
        : t({ id: 'money.budget.day', message: `Day ${day} of ${days}` });
  // "Budget" over "Bali · Day 5 of 8" (7.29): the place rides in the subtitle, not the title.
  const subtitle = budget.place === '' ? when : `${budget.place} · ${when}`;
  return (
    <WalletGuideProvider tripId={budget.tripId}>
      <PushScreen
        title={title}
        subtitle={subtitle}
        backLabel={backLabel}
        scroll={false}
        testID="money-budget"
      >
        <Body budget={budget} />
      </PushScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({ page: { flex: 1 } });
