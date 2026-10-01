/**
 * The crew chat card for an `expense` message (3g-1): "Maya paid Rp 1.08M for lunch", "Split 6
 * ways · Rp 180K each" and VIEW into the expense. It reads the synced expense the message points
 * at, so it renders offline; a card whose expense has not synced yet keeps a quiet placeholder.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import type { ChatCardProps } from '@/features/crew';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useLocale } from '@/lib/i18n/use-locale';
import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { CATEGORY_ICON } from '../components/category';
import { categoryOf } from '../data/expense-items';
import { useLiveRows } from '../data/live-rows';
import { minor, UID_SQL, UID_TABLES } from '../data/queries';
import { formatShort } from '../format';
import { expenseRoute } from '../routes';

export const CHAT_EXPENSE_SQL = `SELECT e.id, e.payer_id, e.amount_minor, e.currency, e.split_mode,
    e.category, e.description, e.merchant, e.deleted_at, u.display_name AS payer_name
  FROM expenses e LEFT JOIN users u ON u.id = e.payer_id WHERE e.id = ?`;
export const CHAT_EXPENSE_SHARES_SQL = `SELECT computed_minor FROM expense_shares
  WHERE expense_id = ?`;
const TABLES = ['expenses', 'users', 'expense_shares'];

interface ChatExpenseRow {
  readonly id: string;
  readonly payer_id: string;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly split_mode: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly merchant: string | null;
  readonly deleted_at: string | null;
  readonly payer_name: string | null;
}

/**
 * The card's share of the screen: the chat's text bubbles cap at the same fraction. Its wrappers in
 * the timeline are content-sized, so a percentage would squeeze the lines word by word.
 */
const CARD_SHARE = 0.82;

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
  const width = Math.round(useWindowDimensions().width * CARD_SHARE);
  const params = message.refId === null ? null : [message.refId];
  const expense = useLiveRows<ChatExpenseRow>(CHAT_EXPENSE_SQL, params, TABLES);
  const shares = useLiveRows<{ computed_minor: number | string | null }>(
    CHAT_EXPENSE_SHARES_SQL,
    params,
    TABLES,
  );
  const uid = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES).rows[0]?.value;
  const row = expense.rows[0];
  if (row === undefined) {
    return (
      <Skeleton
        preset="card"
        label={t({ id: 'money.chat.loading', message: 'Loading the expense' })}
      />
    );
  }
  if (row.deleted_at !== null) {
    return (
      <View style={[styles.card, { width }]} testID={`chat-expense-${row.id}`}>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'money.chat.deleted', message: 'This expense was deleted' })}
        </Text>
      </View>
    );
  }
  const amountMinor = minor(row.amount_minor);
  const amount = formatShort(amountMinor, row.currency, locale);
  const what = (row.description || row.merchant || '').trim();
  const payer = row.payer_name ?? message.senderName ?? '';
  const paid =
    row.payer_id === uid
      ? what === ''
        ? t({ id: 'money.chat.youPaid', message: `You paid ${amount}` })
        : t({ id: 'money.chat.youPaidFor', message: `You paid ${amount} for ${what}` })
      : what === ''
        ? t({ id: 'money.chat.paid', message: `${payer} paid ${amount}` })
        : t({ id: 'money.chat.paidFor', message: `${payer} paid ${amount} for ${what}` });
  const ways = shares.rows.filter((share) => minor(share.computed_minor) > 0n).length;
  const each = ways > 0 ? formatShort(amountMinor / BigInt(ways), row.currency, locale) : '';
  // A split needs two people; one person's own expense has no split to show.
  const split =
    ways < 2
      ? null
      : row.split_mode === 'equal'
        ? t({ id: 'money.chat.splitEach', message: `Split ${ways} ways · ${each} each` })
        : t({ id: 'money.chat.split', message: `Split ${ways} ways` });
  const view = t({ id: 'money.chat.view', message: 'View' });
  return (
    <View style={[styles.card, { width }]} testID={`chat-expense-${row.id}`}>
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
        onPress={() => router.push(expenseRoute(row.id))}
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
