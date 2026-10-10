/**
 * The crew chat card for an `expense` message (3g-1): "Maya paid Rp 1.08M for lunch", "Split 6
 * ways · Rp 180K each" and VIEW into the expense. It reads the synced expense the message points
 * at, so it renders offline, and VIEW opens it in the message's own trip. The card holds the trip's stream while it is on screen (the chat itself
 * rides the crew's streams); until the expense arrives it keeps a placeholder in the card's slot, and an
 * expense the crew deleted (deleted expenses leave the stream, their edit history stays) says who
 * removed it instead of an empty bubble.
 */
import { perHeadMinor } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import type { ChatCardProps } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { CATEGORY_ICON } from '../components/category';
import { categoryOf } from '../data/expense-items';
import { minor } from '../data/queries';
import { formatShort } from '../format';
import { expenseRoute } from '../routes';
import { useChatExpense } from './use-chat-expense';

const useStyles = makeStyles((th) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['12'],
    paddingStart: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.semantic.border.decorative,
    backgroundColor: th.semantic.bg.raised,
  },
  body: { flex: 1, gap: th.space['2'] },
  // Undesigned: a deleted expense keeps its place as a quiet outlined card, without the VIEW action.
  removed: { paddingEnd: th.space['14'], backgroundColor: 'transparent' },
  // 3g-1: VIEW is the card's action in the primary yellow, a bare label with a full touch target.
  view: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: th.space['14'],
  },
}));

export function ExpenseChatCard({ message }: ChatCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const state = useChatExpense(message.id, message.refId);
  if (state.kind === 'gone') {
    const who =
      state.removedBy === null
        ? null
        : state.removedBy.self
          ? t({ id: 'money.chat.you', message: 'You' })
          : state.removedBy.name;
    const what = message.body.trim();
    return (
      <View style={[styles.card, styles.removed]} testID={`chat-expense-removed-${message.id}`}>
        <View style={styles.body}>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {who === null
              ? t({ id: 'money.chat.deleted', message: 'This expense was deleted' })
              : t({ id: 'money.chat.deletedBy', message: `${who} deleted this expense` })}
          </Text>
          {what === '' ? null : (
            <Text variant="caption" color={theme.semantic.text.tertiary} numberOfLines={1}>
              {what}
            </Text>
          )}
        </View>
      </View>
    );
  }
  if (state.kind === 'loading') {
    return (
      <Skeleton
        preset="card"
        label={t({ id: 'money.chat.loading', message: 'Loading the expense' })}
        testID={`chat-expense-loading-${message.id}`}
      />
    );
  }
  const { row, ways } = state;
  const amountMinor = minor(row.amount_minor);
  const amount = formatShort(amountMinor, row.currency, locale);
  const what = (row.description || row.merchant || '').trim();
  const payer = row.payer_name ?? message.senderName ?? '';
  const paid = state.paidBySelf
    ? what === ''
      ? t({ id: 'money.chat.youPaid', message: `You paid ${amount}` })
      : t({ id: 'money.chat.youPaidFor', message: `You paid ${amount} for ${what}` })
    : what === ''
      ? t({ id: 'money.chat.paid', message: `${payer} paid ${amount}` })
      : t({ id: 'money.chat.paidFor', message: `${payer} paid ${amount} for ${what}` });
  // The engine's per-head figure (half up), the same one the keypad shows before ADD.
  const each = ways > 0 ? formatShort(perHeadMinor(amountMinor, ways), row.currency, locale) : '';
  // A split needs two people; one person's own expense has no split to show.
  const split =
    ways < 2
      ? null
      : row.split_mode === 'equal'
        ? t({ id: 'money.chat.splitEach', message: `Split ${ways} ways · ${each} each` })
        : t({ id: 'money.chat.split', message: `Split ${ways} ways` });
  const view = t({ id: 'money.chat.view', message: 'View' });
  return (
    <View style={styles.card} testID={`chat-expense-${row.id}`}>
      <Icon name={CATEGORY_ICON[categoryOf(row.category)]} size={28} decorative />
      <View style={styles.body}>
        <Text variant="rowTitle">{paid}</Text>
        {split === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {split}
          </Text>
        )}
      </View>
      <PressScale
        accessibilityLabel={`${view}, ${paid}`}
        // The message's trip goes along: the expense opens whatever trip Money is showing.
        onPress={() => router.push(expenseRoute(row.id, state.tripId))}
        widthClass="narrow"
        style={styles.view}
        testID={`chat-expense-view-${row.id}`}
      >
        <Text variant="buttonSm" color={theme.semantic.action.primary}>
          {upper(view, locale)}
        </Text>
      </PressScale>
    </View>
  );
}
