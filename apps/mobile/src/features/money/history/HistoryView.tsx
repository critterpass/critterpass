/**
 * The full expense history (undesigned, built from the Balances row and filter chips): every
 * expense of the trip grouped by the day it was spent, newest first, filterable by who was in it
 * and by category. Queued expenses show as pending at the top of their day. The list is
 * virtualised (a long trip has hundreds of rows) and the filter rows scroll to the screen's edge.
 * A trip with no expenses yet is the shared empty state (the money guide asleep, the line, the
 * keypad) in the middle of the room under the title; a filter that matches nothing says that
 * instead.
 */
import type { ExpenseCategory } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { FilterChip } from '@/ui/chips/FilterChip';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import { CATEGORY_ORDER, useCategoryLabel } from '../components/category';
import { ExpenseListRow } from '../components/ExpenseListRow';
import type { MoneyMember } from '../data/context';
import { groupByDay, type ExpenseFilter, type ExpenseItem } from '../data/expense-items';
import { calendarDate } from '../format';
import { MONEY_ROUTES } from '../routes';

/** The sleeping guide of an empty state, as 3b-5 draws it. */
const STICKER_SIZE = 120;

const useStyles = makeStyles((t) => ({
  header: { gap: t.space['16'], paddingTop: t.space['8'], paddingBottom: t.space['8'] },
  gutter: { paddingHorizontal: t.size.gutter },
  chips: { gap: t.space['8'], paddingHorizontal: t.size.gutter },
  day: { paddingHorizontal: t.size.gutter, paddingTop: t.space['12'] },
  none: { flex: 1, justifyContent: 'center', alignItems: 'center' },
}));

export interface HistoryViewProps {
  readonly items: readonly ExpenseItem[];
  /** How many expenses the trip has before the filters: none at all reads differently. */
  readonly total: number;
  readonly members: readonly MoneyMember[];
  readonly crewCurrency: string;
  readonly filter: ExpenseFilter;
  readonly onFilter: (next: ExpenseFilter) => void;
  readonly onExpense: (id: string) => void;
  readonly onAdd: () => void;
}

type HistoryRow =
  | { readonly kind: 'day'; readonly key: string; readonly localDate: string }
  | { readonly kind: 'expense'; readonly key: string; readonly item: ExpenseItem };

/** Day headers and their expenses as one flat list, in the order they are shown. */
export function historyRows(items: readonly ExpenseItem[]): HistoryRow[] {
  return groupByDay(items).flatMap((group): HistoryRow[] => [
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a list key, never copy
    { kind: 'day', key: `day:${group.localDate}`, localDate: group.localDate },
    ...group.items.map((item): HistoryRow => ({ kind: 'expense', key: item.id, item })),
  ]);
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

const HistoryItem = memo(function HistoryItem({
  row,
  crewCurrency,
  onExpense,
}: {
  readonly row: HistoryRow;
  readonly crewCurrency: string;
  readonly onExpense: (id: string) => void;
}) {
  const styles = useStyles();
  const locale = useLocale();
  if (row.kind === 'day') {
    return (
      <View style={styles.day}>
        <Text variant="eyebrow">{upper(dayLabel(locale, row.localDate), locale)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.gutter}>
      <ExpenseListRow
        item={row.item}
        crewCurrency={crewCurrency}
        onOpen={onExpense}
        testID={`money-history-row-${row.item.id}`}
      />
    </View>
  );
});

export function HistoryView(props: HistoryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const guide = useWalletGuide();
  const rows = useMemo(() => historyRows(props.items), [props.items]);
  const { crewCurrency, onExpense } = props;
  const setMember = (memberId: string | null) => props.onFilter({ ...props.filter, memberId });
  const setCategory = (category: ExpenseCategory | null) =>
    props.onFilter({ ...props.filter, category });
  const renderItem = useCallback(
    ({ item }: { readonly item: HistoryRow }) => (
      <HistoryItem row={item} crewCurrency={crewCurrency} onExpense={onExpense} />
    ),
    [crewCurrency, onExpense],
  );
  const header = (
    <View style={styles.header}>
      <View style={styles.gutter}>
        <BackEyebrow
          label={upper(t({ id: 'money.back', message: 'Money' }), locale)}
          fallback={MONEY_ROUTES.balances}
        />
      </View>
      <View style={styles.gutter}>
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'money.history.title', message: 'Every expense' }), locale)}
        </Text>
      </View>
      {props.total === 0 ? null : (
        <>
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
        </>
      )}
    </View>
  );
  if (props.total === 0) {
    const critter = guideSticker(guide.id);
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="money-history">
        {header}
        <View style={styles.none}>
          <EmptyState
            guide={guide.id}
            guideName={guide.name}
            sticker={
              <Sticker
                kind={critter.kind}
                name={guide.name}
                seed={critter.seed}
                pose="sleep"
                size={STICKER_SIZE}
              />
            }
            title={t({ id: 'money.empty.title', message: 'No expenses yet' })}
            line={t({
              id: 'money.empty.line',
              message:
                "Log what the crew spends and I'll keep who-owes-who straight. Nobody does maths.",
            })}
            action={{
              label: upper(t({ id: 'money.empty.add', message: 'Add an expense' }), locale),
              onPress: props.onAdd,
            }}
            testID="money-history-none"
          />
        </View>
      </Scaffold>
    );
  }
  return (
    <Scaffold variant="dark" testID="money-history">
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.day}>
            <Text variant="body" color={theme.semantic.text.secondary} testID="money-history-empty">
              {t({ id: 'money.history.empty', message: 'No expenses match.' })}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['32'] }}
        testID="money-history-list"
      />
    </Scaffold>
  );
}
