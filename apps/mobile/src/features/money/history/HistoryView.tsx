/**
 * The full expense history (undesigned, built from the Balances row and filter chips): every
 * expense of the trip grouped by the day it was spent, newest first, filterable by who was in it
 * and by category. Queued expenses show as pending at the top of their day.
 */
import type { ExpenseCategory } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { FilterChip } from '@/ui/chips/FilterChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { CATEGORY_ORDER, useCategoryLabel } from '../components/category';
import { ExpenseListRow } from '../components/ExpenseListRow';
import type { MoneyMember } from '../data/context';
import { calendarDate } from '../format';
import { groupByDay, type ExpenseFilter, type ExpenseItem } from '../data/expense-items';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
  chips: { gap: t.space['8'], paddingRight: t.size.gutter },
}));

export interface HistoryViewProps {
  readonly items: readonly ExpenseItem[];
  readonly members: readonly MoneyMember[];
  readonly crewCurrency: string;
  readonly filter: ExpenseFilter;
  readonly onFilter: (next: ExpenseFilter) => void;
  readonly onExpense: (id: string) => void;
}

function dayLabel(locale: string, localDate: string): string {
  const date = calendarDate(localDate);
  if (Number.isNaN(date.getTime())) return localDate;
  return format.date(locale, date, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function HistoryView(props: HistoryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const groups = groupByDay(props.items);
  const setMember = (memberId: string | null) => props.onFilter({ ...props.filter, memberId });
  const setCategory = (category: ExpenseCategory | null) =>
    props.onFilter({ ...props.filter, category });
  return (
    <Scaffold variant="dark" testID="money-history">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['32'] },
        ]}
      >
        <BackEyebrow label={upper(t({ id: 'money.back', message: 'Money' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'money.history.title', message: 'Every expense' }), locale)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row style={styles.chips}>
            <FilterChip
              label={t({ id: 'money.history.everyone', message: 'Everyone' })}
              selected={props.filter.memberId === null}
              onPress={() => setMember(null)}
              testID="money-history-member-all"
            />
            {props.members.map((member) => (
              <FilterChip
                key={member.userId}
                label={member.name}
                selected={props.filter.memberId === member.userId}
                onPress={() =>
                  setMember(props.filter.memberId === member.userId ? null : member.userId)
                }
              />
            ))}
          </Row>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row style={styles.chips}>
            {CATEGORY_ORDER.map((category) => (
              <FilterChip
                key={category}
                label={categoryLabel(category)}
                selected={props.filter.category === category}
                onPress={() => setCategory(props.filter.category === category ? null : category)}
                testID={`money-history-category-${category}`}
              />
            ))}
          </Row>
        </ScrollView>
        {groups.length === 0 ? (
          <Text variant="body" color={theme.semantic.text.secondary} testID="money-history-empty">
            {t({ id: 'money.history.empty', message: 'No expenses match.' })}
          </Text>
        ) : (
          groups.map((group) => (
            <Stack key={group.localDate} gap="4">
              <Text variant="eyebrow">{upper(dayLabel(locale, group.localDate), locale)}</Text>
              {group.items.map((item) => (
                <ExpenseListRow
                  key={item.id}
                  item={item}
                  crewCurrency={props.crewCurrency}
                  onPress={() => props.onExpense(item.id)}
                  testID={`money-history-row-${item.id}`}
                />
              ))}
            </Stack>
          ))
        )}
      </ScrollView>
    </Scaffold>
  );
}
