/** The budget's summary card (7.29): spent against the plan, the bar that runs on past it, and the pace. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import { estimateMinor, finishDeltaShown } from '../../budget/estimates';
import { type BudgetState } from '../../budget/use-budget';
import { formatWhole } from '../../format';
import { BudgetBar } from './BudgetBar';

type Ready = Extract<BudgetState, { kind: 'ready' }>;

export function BudgetSummary({ budget }: { readonly budget: Ready }) {
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
      {planned === null ? (
        <Text variant="rowText" tone="inkSecondary" testID="money-budget-none">
          {budget.organiser
            ? t({
                id: 'money.premium.budget.noneOrganiser',
                message: 'No crew budget yet. Set one and I keep the crew on track against it.',
              })
            : t({
                id: 'money.premium.budget.none',
                message: 'No crew budget yet. The organiser can set one for the trip.',
              })}
        </Text>
      ) : (
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

const styles = StyleSheet.create({
  summary: { padding: 16, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  end: { alignItems: 'flex-end', gap: 4 },
  tabular: { fontVariant: ['tabular-nums'] },
});
