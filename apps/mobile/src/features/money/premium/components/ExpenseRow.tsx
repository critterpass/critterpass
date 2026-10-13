/**
 * One expense in a premium list (7.17 "Latest", 7.23): the category tile, what it was and who paid
 * (with anyone left out), and the amount in the crew currency. A queued change reads as waiting; a
 * queued delete strikes the amount through.
 */
import { useLingui } from '@lingui/react/macro';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { homeEquivalent, useMoneyDisplay } from '@/data/money';
import { IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { useCategoryLabel } from '../../components/category';
import type { ExpenseItem } from '../../data/expense-items';
import { formatAmount, formatShort } from '../../format';
import { categoryLook } from './category-look';

export interface ExpenseRowProps {
  readonly item: ExpenseItem;
  readonly crewCurrency: string;
  readonly onOpen: (id: string) => void;
  readonly testID?: string;
}

export const ExpenseRow = memo(function ExpenseRow({
  item,
  crewCurrency,
  onOpen,
  testID,
}: ExpenseRowProps) {
  const th = usePremiumTheme();
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const look = categoryLook(item.category, th.color);
  const title = item.title === '' ? categoryLabel(item.category) : item.title;
  const payer = item.payerName;
  const names = item.leftOut.join(', ');
  const parts = [
    payer === '' ? null : t({ id: 'money.row.paid', message: `${payer} paid` }),
    item.currency === crewCurrency ? null : formatShort(item.amountMinor, item.currency, locale),
    homeEquivalent(item.amountMinor, item.currency, locale),
    item.leftOut.length === 0 ? null : t({ id: 'money.row.leftOut', message: `${names} left out` }),
    item.pending === null
      ? null
      : item.pending === 'delete'
        ? t({ id: 'money.row.pendingDelete', message: 'Deleting when you are back online' })
        : t({ id: 'money.row.pending', message: 'Waiting to sync' }),
  ].filter((part): part is string => part !== null);
  const amount =
    item.crewAmountMinor === null
      ? formatAmount(item.amountMinor, item.currency, locale)
      : formatAmount(item.crewAmountMinor, crewCurrency, locale);
  return (
    <PressableScale
      onPress={() => onOpen(item.id)}
      accessibilityRole="button"
      accessibilityLabel={[title, parts.join(', '), amount].join(', ')}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={[
          styles.row,
          {
            gap: th.space.gap12,
            paddingVertical: th.space.rowPadV,
            paddingStart: th.space.rowPadLeadBadge,
            paddingEnd: th.space.gap16,
            opacity: item.pending === null ? 1 : 0.7,
          },
        ]}
      >
        <IconTile name={look.icon} bg={look.bg} color={look.color} size={46} />
        <View style={styles.body}>
          <Text variant="rowTitle" numberOfLines={2}>
            {title}
          </Text>
          <PrivateContent>
            <Text variant="captionMuted" tone="muted" numberOfLines={2}>
              {parts.join(' · ')}
            </Text>
          </PrivateContent>
        </View>
        <PrivateContent>
          <Text
            variant="rowTitle"
            style={[styles.amount, item.pending === 'delete' ? styles.struck : null]}
          >
            {amount}
          </Text>
        </PrivateContent>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  body: { flex: 1 },
  amount: { fontVariant: ['tabular-nums'] },
  struck: { textDecorationLine: 'line-through' },
});
