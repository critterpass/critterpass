/**
 * The premium crew chat card for an `expense` message (5.01): the category tile, "Maya paid
 * Rp 1.08M", "Babi guling · split 6 ways", View into the expense, and the viewer's own share under
 * a hairline. It reads the synced expense the message points at, so it renders offline, and View
 * opens it in the message's own trip. Until the expense arrives it holds a placeholder in its slot;
 * an expense the crew deleted says who removed it instead of an empty bubble.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import { homeEquivalent, useMoneyDisplay } from '@/data/money';
import type { ChatCardProps } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  makePremiumStyles,
  Skeleton,
  StickerIcon,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { useChatExpense } from '../chat/use-chat-expense';
import { categoryOf } from '../data/expense-items';
import { minor } from '../data/queries';
import { formatAmount, formatShort } from '../format';
import { expenseRoute } from '../routes';
import { categoryLook } from './components/category-look';

const useStyles = makePremiumStyles((th) => ({
  card: {
    width: 282,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  body: { flex: 1, minWidth: 0 },
  share: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: th.color.hairline,
  },
  // Undesigned: a deleted expense keeps its place as a quiet card on the ground, without View.
  removed: { backgroundColor: th.color.control, boxShadow: 'none' },
}));

export function ExpenseChatCardPremium({ message }: ChatCardProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useLocale();
  useMoneyDisplay();
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
        <Text variant="rowText" tone="muted">
          {who === null
            ? t({ id: 'money.chat.deleted', message: 'This expense was deleted' })
            : t({ id: 'money.chat.deletedBy', message: `${who} deleted this expense` })}
        </Text>
        {what === '' ? null : (
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {what}
          </Text>
        )}
      </View>
    );
  }
  if (state.kind === 'loading') {
    return (
      <View
        accessibilityLabel={t({ id: 'money.chat.loading', message: 'Loading the expense' })}
        testID={`chat-expense-loading-${message.id}`}
      >
        <Skeleton width={282} height={68} radius={22} />
      </View>
    );
  }
  const { row, ways, myShareMinor } = state;
  const amount = formatShort(minor(row.amount_minor), row.currency, locale);
  const what = (row.description || row.merchant || '').trim();
  const payer = shortName(row.payer_name ?? message.senderName);
  const paid = state.paidBySelf
    ? t({ id: 'money.chat.youPaid', message: `You paid ${amount}` })
    : t({ id: 'money.chat.paid', message: `${payer} paid ${amount}` });
  // A split needs two people; one person's own expense has no split to show.
  const split =
    ways < 2
      ? what
      : what === ''
        ? t({ id: 'money.chat.premium.split', message: `Split ${ways} ways` })
        : t({ id: 'money.chat.premium.splitFor', message: `${what} · split ${ways} ways` });
  const share =
    myShareMinor === null || ways < 2
      ? null
      : (homeEquivalent(myShareMinor, row.currency, locale)?.replace(/^≈ /u, '') ??
        formatAmount(myShareMinor, row.currency, locale));
  const look = categoryLook(categoryOf(row.category), th.color);
  const view = t({ id: 'money.chat.view', message: 'View' });
  return (
    <View style={styles.card} testID={`chat-expense-${row.id}`}>
      <View style={styles.row}>
        <StickerIcon name={look.icon} size={44} tile={look.bg} />
        <View style={styles.body}>
          <Text variant="rowTitle" numberOfLines={2}>
            {paid}
          </Text>
          {split === '' ? null : (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {split}
            </Text>
          )}
        </View>
        <Button
          alignSelf="auto"
          label={view}
          variant="control"
          size="small"
          accessibilityHint={paid}
          // The message's trip goes along: the expense opens whatever trip Money is showing.
          onPress={() => router.push(expenseRoute(row.id, state.tripId))}
          testID={`chat-expense-view-${row.id}`}
        />
      </View>
      {share === null ? null : (
        <View style={styles.share} testID={`chat-expense-share-${row.id}`}>
          <Text variant="caption" tone="muted">
            {t({ id: 'money.chat.premium.yourShare', message: 'Your share' })}
          </Text>
          <Text variant="rowTextStrong">{share}</Text>
        </View>
      )}
    </View>
  );
}
