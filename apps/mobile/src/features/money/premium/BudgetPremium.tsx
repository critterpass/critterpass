/**
 * The budget (7.29): spent against the crew's plan, large, with "$86 over" or what is left, a bar
 * that fills in ink to the plan and runs on in pink past it, and the pace ("Heading for $220
 * over"). Where it went, by category, with each one's difference from its plan. The guide names
 * the biggest cost still to come. An organiser sets or raises the budget in place (online only).
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { amountText, digitsToMinor } from '@/data/money/amount-digits';
import { useWalletGuide, WalletGuideProvider } from '@/features/bookings';
import { guideCritterKind } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  GuideNote,
  Skeleton,
  StatusTag,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { estimateMinor, finishDeltaShown } from '../budget/estimates';
import { useBudget, type BudgetState } from '../budget/use-budget';
import { formatWhole } from '../format';
import { BudgetBar } from './components/BudgetBar';
import { BudgetCategories } from './components/BudgetCategories';

type Ready = Extract<BudgetState, { kind: 'ready' }>;

function Summary({ budget }: { readonly budget: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const f = budget.forecast;
  const whole = (minor: bigint) => formatWhole(minor, budget.currency, locale);
  const planned = f.plannedMinor === null ? null : estimateMinor(f.plannedMinor, budget.currency);
  const over = planned !== null && f.spentMinor > planned ? f.spentMinor - planned : null;
  const delta = finishDeltaShown(f, budget.currency);
  const deltaText = delta === null ? '' : whole(delta < 0n ? -delta : delta);
  // Where the forecast ends, as the difference beside it is counted, so the sentence adds up.
  const finish = planned === null || delta === null ? '' : whole(planned - delta);
  const pace =
    delta === null
      ? null
      : delta >= 0n
        ? t({
            id: 'money.premium.budget.paceUnder',
            message: `At this pace you'll end around ${finish}, about ${deltaText} under.`,
          })
        : t({
            id: 'money.premium.budget.paceOver',
            message: `At this pace you'll end around ${finish}, about ${deltaText} over.`,
          });
  // The ink runs to the plan (or to what was spent, under it); past the plan it turns pink.
  const inkShare =
    planned === null || planned === 0n || f.spentMinor === 0n
      ? 0
      : over === null
        ? Number((f.spentMinor * 1000n) / planned) / 1000
        : Number((planned * 1000n) / f.spentMinor) / 1000;
  const planAt = over === null ? 1 : inkShare;
  return (
    <View
      style={[
        styles.summary,
        {
          marginHorizontal: th.space.gap16,
          borderRadius: th.radius.cardLarge,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="money-budget-summary"
    >
      <View style={styles.headRow}>
        <View style={styles.flex}>
          <Text variant="label" tone="muted">
            {t({ id: 'money.premium.spent', message: 'Spent' })}
          </Text>
          <Text variant="display" style={styles.tabular} testID="money-budget-spent">
            {whole(f.spentMinor)}
          </Text>
        </View>
        {planned === null ? null : (
          <View style={styles.end}>
            <Text variant="label" tone="muted">
              {t({ id: 'money.premium.ofPlanned', message: `of ${whole(planned)} planned` })}
            </Text>
            {over === null ? (
              <StatusTag
                label={t({
                  id: 'money.premium.left',
                  message: `${whole(planned - f.spentMinor)} left`,
                })}
                tone="booked"
              />
            ) : (
              <StatusTag
                label={t({ id: 'money.premium.overBy', message: `${whole(over)} over` })}
                tone="voteOpen"
              />
            )}
          </View>
        )}
      </View>
      {planned === null ? null : (
        <BudgetBar inkShare={inkShare} planAt={planAt} over={over !== null} days={budget.days} />
      )}
      {pace === null ? null : (
        <Text variant="rowText" tone="inkSecondary" testID="money-budget-pace">
          {pace}
        </Text>
      )}
    </View>
  );
}

function Body({ budget }: { readonly budget: Ready }) {
  const th = usePremiumTheme();
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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, gap: th.space.gap16 }}
      >
        <Summary budget={budget} />
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
      </ScrollView>
      {budget.organiser ? (
        <KeyboardStickyFooter>
          <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: th.space.gap12 }}>
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
  const subtitle =
    day === 0
      ? t({ id: 'money.budget.before', message: 'Before the trip' })
      : day > budget.days
        ? t({ id: 'money.budget.after', message: 'Trip over' })
        : t({ id: 'money.budget.day', message: `Day ${day} of ${days}` });
  return (
    <WalletGuideProvider tripId={budget.tripId}>
      <PushScreen
        title={budget.title}
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

const styles = StyleSheet.create({
  summary: { padding: 16, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  end: { alignItems: 'flex-end', gap: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
