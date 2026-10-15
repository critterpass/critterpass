/** Where the budget went (7.29): each category with what it cost and how far off its plan. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { StickerIcon, Text, usePremiumTheme } from '@/ui/premium';

import { estimateMinor } from '../../budget/estimates';
import type { BudgetState } from '../../budget/use-budget';
import { useCategoryLabel } from '../../components/category';
import { formatWhole } from '../../format';
import { categoryLook } from './category-look';

type Ready = Extract<BudgetState, { kind: 'ready' }>;

export function BudgetCategories({ budget }: { readonly budget: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const label = useCategoryLabel();
  const lines = budget.forecast.categories.filter(
    (line) => line.plannedMinor > 0n || line.spentMinor > 0n,
  );
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
        {t({ id: 'money.premium.whereItWent', message: 'Where it went' })}
      </Text>
      <View
        style={[
          styles.card,
          {
            marginHorizontal: th.space.gap16,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        {lines.map((line, index) => {
          const look = categoryLook(line.category, th.color);
          const plan = estimateMinor(line.plannedMinor, budget.currency);
          const diff = line.spentMinor - plan;
          return (
            <View
              key={line.category}
              style={[
                styles.row,
                index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
              ]}
              testID={`money-budget-category-${line.category}`}
            >
              <StickerIcon name={look.icon} size={40} tile={look.bg} />
              <Text variant="rowTitle" style={styles.flex}>
                {label(line.category)}
              </Text>
              <View style={styles.end}>
                <Text variant="rowTextStrong" style={styles.tabular}>
                  {formatWhole(line.spentMinor, budget.currency, locale)}
                </Text>
                {line.plannedMinor === 0n ? null : (
                  <Text
                    variant="helper"
                    color={diff > 0n ? th.color.destructive.text : th.color.status.booked.text}
                  >
                    {diff > 0n
                      ? `+${formatWhole(diff, budget.currency, locale)}`
                      : `−${formatWhole(-diff, budget.currency, locale)}`}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
