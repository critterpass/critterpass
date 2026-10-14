/**
 * Every expense (7.23): "Everyone" and one avatar per person who paid or shares, as a filter row
 * that bleeds off the right edge (the picked person wears the payer ring), then the expenses by
 * day with each day's total in the crew's currency. Rows open the expense; `+` adds one. The days
 * are a virtualised list, so a long trip draws only the days on screen.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Chip,
  EmptyState,
  PressableScale,
  ring,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Skeleton,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { groupByDay, type ExpenseItem } from '../data/expense-items';
import { calendarDate, formatAmount } from '../format';
import { useHistory } from '../history/use-history';
import { ExpenseRow } from './components/ExpenseRow';

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

function dayTotal(items: readonly ExpenseItem[]): bigint {
  return items.reduce((sum, item) => sum + (item.crewAmountMinor ?? 0n), 0n);
}

export function HistoryPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const history = useHistory();
  const { filter } = history;
  const groups = useMemo(() => groupByDay(history.shown), [history.shown]);
  // Still reading, or nothing spent yet: the list holds only the skeleton or the empty state.
  const none = history.loading || history.items.length === 0;
  const filters = (
    <ScrollRow
      gap={6}
      contentContainerStyle={{ paddingHorizontal: th.space.gutter }}
      style={styles.filters}
      testID="money-history-filters"
    >
      <Chip
        label={t({ id: 'money.history.everyone', message: 'Everyone' })}
        selected={filter.memberId === null}
        surface="white"
        onPress={() => history.setFilter({ ...filter, memberId: null })}
        testID="money-history-everyone"
      />
      {history.members.map((member) => {
        const selected = filter.memberId === member.userId;
        return (
          <PressableScale
            key={member.userId}
            onPress={() =>
              history.setFilter({ ...filter, memberId: selected ? null : member.userId })
            }
            accessibilityRole="button"
            accessibilityLabel={member.name}
            accessibilityState={{ selected }}
            testID={`money-history-member-${member.userId}`}
          >
            <View
              style={[
                styles.avatarRing,
                selected
                  ? {
                      boxShadow: [ring(2.5, th.color.ground), ring(4.5, th.color.ink)].join(', '),
                    }
                  : { opacity: filter.memberId === null ? 1 : 0.45 },
              ]}
            >
              <Avatar
                name={member.name}
                color={crewAccent(member.joinIndex)}
                uid={member.userId}
                size={36}
              />
            </View>
          </PressableScale>
        );
      })}
    </ScrollRow>
  );
  return (
    <PushScreen
      largeTitle
      title={t({ id: 'money.history.premiumTitle', message: 'Every expense' })}
      backLabel={t({ id: 'money.back', message: 'Money' })}
      action={{
        key: 'add',
        label: t({ id: 'money.empty.add', message: 'Add an expense' }),
        sfSymbol: 'plus',
        glyph: 'plus',
        onPress: history.onAdd,
        testID: 'money-history-add',
      }}
      scroll={false}
      testID="money-history"
    >
      <FlatList
        data={none ? [] : groups}
        keyExtractor={(group) => group.localDate}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ gap: th.space.gap16, paddingBottom: th.space.gap16 }}
        {...(none ? {} : { ListHeaderComponent: filters })}
        ListEmptyComponent={
          history.loading ? (
            <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap12 }}>
              <Skeleton height={36} radius={18} />
              <Skeleton height={180} radius={th.radius.card} />
            </View>
          ) : history.items.length === 0 ? (
            <EmptyState
              title={t({ id: 'money.history.emptyTitle', message: 'No expenses yet' })}
              line={t({
                id: 'money.history.emptyLine',
                message: 'Add one, or scan a receipt, and it shows here for the whole crew.',
              })}
            />
          ) : (
            <Text variant="body" tone="muted" align="center" testID="money-history-nomatch">
              {t({ id: 'money.history.noMatch', message: 'Nothing matches that filter.' })}
            </Text>
          )
        }
        initialNumToRender={4}
        windowSize={7}
        renderItem={({ item: group }) => (
          <View style={{ gap: th.space.gap8 }}>
            <View style={[styles.dayHead, { paddingHorizontal: th.space.titleGutter }]}>
              <Text variant="label" tone="muted">
                {dayLabel(locale, group.localDate)}
              </Text>
              <Text variant="label" tone="muted" style={styles.tabular}>
                {formatAmount(dayTotal(group.items), history.currency, locale)}
              </Text>
            </View>
            <View
              style={[
                styles.card,
                {
                  marginHorizontal: th.space.gutter,
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
            >
              {group.items.map((item) => (
                <ExpenseRow
                  key={item.id}
                  item={item}
                  crewCurrency={history.currency}
                  onOpen={history.onExpense}
                  testID={`money-history-${item.id}`}
                />
              ))}
            </View>
          </View>
        )}
      />
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  // 4 pt above and below the chips; the row's own room for the chosen ring sits inside it.
  filters: { marginTop: 4 - ROW_ROOM_ABOVE, marginBottom: 4 - ROW_ROOM_BELOW },
  avatarRing: { borderRadius: 18 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { overflow: 'hidden' },
  tabular: { fontVariant: ['tabular-nums'] },
});
