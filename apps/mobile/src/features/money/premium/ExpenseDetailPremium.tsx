/**
 * Expense detail (7.21): what it was, the amount as entered large, what it came to in the crew's
 * currency with the payer and the day, tags (category, "split from a receipt scan", waiting to
 * sync), who owes what (by room for a stay split by room; the payer's row in green with what they get back, a left-out row faded),
 * the changes as a timeline, then Edit and Delete for whoever may change it. Delete asks once.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useMoneyDisplay } from '@/data/money';
import { PrivateContent } from '@/features/help';
import { crewAccent, turn } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  EmptyState,
  Skeleton,
  StatusTag,
  StickerIcon,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { useCategoryLabel } from '../components/category';
import {
  changeStampText,
  expenseDayText,
  rateText,
  useFieldLabel,
} from '../expense-detail/detail-copy';
import { useExpenseDetail, type ExpenseDetail } from '../expense-detail/use-expense-detail';
import { formatAmount, formatAmountShown } from '../format';
import { categoryLook } from './components/category-look';
import { RoomSplitSection } from './components/RoomSplitSection';

type Ready = Extract<ExpenseDetail, { kind: 'ready' }>;

function Shares({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { item, currency } = detail;
  const joinIndex = new Map(detail.members.map((member) => [member.userId, member.joinIndex]));
  const total = item.crewAmountMinor ?? 0n;
  return (
    <View style={{ gap: th.space.gap8 }}>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
        {t({ id: 'money.detail.shares', message: 'Who owes what' })}
      </Text>
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
        {detail.shares.map((share) => {
          const payer = share.userId === item.payerId;
          const left = share.crewMinor === 0n;
          const value = left
            ? t({ id: 'money.detail.leftOut', message: 'Left out' })
            : payer
              ? `+${formatAmount(total - share.crewMinor, currency, locale)}`
              : formatAmount(share.crewMinor, currency, locale);
          const tone = payer ? th.color.status.booked.text : th.color.ink;
          return (
            <View
              key={share.userId}
              style={[styles.share, left ? styles.faded : null]}
              testID={`money-detail-share-${share.userId}`}
            >
              <Avatar
                name={share.name}
                color={crewAccent(joinIndex.get(share.userId) ?? 0)}
                uid={share.userId}
                size={28}
              />
              <Text variant="rowText" color={tone} style={styles.flex} numberOfLines={1}>
                {payer
                  ? t({ id: 'money.premium.payerShare', message: `${share.name} · paid` })
                  : share.name}
              </Text>
              <PrivateContent>
                <Text variant="rowTextStrong" color={tone} style={styles.tabular}>
                  {value}
                </Text>
              </PrivateContent>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Changes({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const fieldLabel = useFieldLabel();
  const added = detail.added;
  if (detail.history.length === 0 && added === null) return null;
  const adder = added?.name ?? '';
  const addedOn = added === null ? '' : changeStampText(locale, added.at, detail.tz);
  return (
    <View style={{ gap: th.space.gap8, paddingHorizontal: th.space.titleGutter }}>
      <Text variant="label" tone="muted">
        {t({ id: 'money.detail.history', message: 'Changes' })}
      </Text>
      <View style={[styles.timeline, { borderLeftColor: th.color.fieldBorder }]}>
        {detail.history.map((edit) => {
          const on = changeStampText(locale, edit.at, detail.tz);
          const editor = edit.editorName;
          const what = format.list(locale, edit.fields.map(fieldLabel));
          const line =
            edit.kind === 'deleted'
              ? t({ id: 'money.detail.deletedBy', message: `${editor} deleted it · ${on}` })
              : what === ''
                ? t({ id: 'money.detail.editedBy', message: `${editor} edited it · ${on}` })
                : t({ id: 'money.detail.changedBy', message: `${editor} changed ${what} · ${on}` });
          return (
            <Text key={edit.id} variant="caption" testID={`money-detail-edit-${edit.id}`}>
              {line}
            </Text>
          );
        })}
        {added === null ? null : (
          <Text variant="caption" testID="money-detail-added">
            {t({ id: 'money.premium.detail.addedBy', message: `${adder} added it · ${addedOn}` })}
          </Text>
        )}
      </View>
    </View>
  );
}

export function ExpenseDetailPremium({
  expenseId,
  tripId = null,
}: {
  readonly expenseId: string;
  readonly tripId?: string | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  useMoneyDisplay();
  const categoryLabel = useCategoryLabel();
  const detail = useExpenseDetail(expenseId, tripId);
  const backLabel = t({ id: 'money.back', message: 'Money' });
  if (detail.kind !== 'ready') {
    return (
      <PushScreen title={backLabel} backLabel={backLabel} testID={`money-expense-${detail.kind}`}>
        {detail.kind === 'loading' ? (
          <View style={{ padding: th.space.gutter, gap: th.space.gap12 }}>
            <Skeleton height={60} radius={th.radius.card} />
            <Skeleton height={160} radius={th.radius.card} />
          </View>
        ) : (
          <EmptyState
            title={t({ id: 'money.premium.goneTitle', message: 'This expense is gone' })}
            line={t({
              id: 'money.premium.goneLine',
              message: 'Someone deleted it, or it belongs to a trip you left.',
            })}
          />
        )}
      </PushScreen>
    );
  }
  const { item, currency } = detail;
  const look = categoryLook(item.category, th.color);
  const title = item.title === '' ? categoryLabel(item.category) : item.title;
  const payer = item.payerName;
  const converted =
    item.crewAmountMinor !== null && item.currency !== currency
      ? `≈ ${formatAmount(item.crewAmountMinor, currency, locale)}`
      : null;
  const when = item.localDate === '' ? '' : expenseDayText(locale, item.localDate);
  const sub = [
    converted,
    payer === '' ? null : t({ id: 'money.row.paid', message: `${payer} paid` }),
    when,
  ]
    .filter(Boolean)
    .join(' · ');
  const rate = rateText(locale, detail.fx);
  const askDelete = () =>
    void confirmAlert({
      title: t({ id: 'money.detail.deleteTitle', message: 'Delete this expense?' }),
      message: [
        t({
          id: 'money.detail.deleteLedger',
          message: 'Everyone’s balance goes back to how it was before it.',
        }),
        t({ id: 'money.detail.deleteHistory', message: 'The crew still sees it in the history.' }),
      ].join(' '),
      confirm: t({ id: 'money.detail.deleteConfirm', message: 'Delete' }),
      cancel: t({ id: 'money.premium.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) void detail.confirmDelete();
    });
  return (
    <PushScreen
      title={backLabel}
      backLabel={backLabel}
      // Edit and Delete stand at the page's foot on its ground, as the design pins them.
      footer={
        detail.canChange ? (
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Button
                label={t({ id: 'money.detail.edit', message: 'Edit' })}
                variant="secondary"
                onPress={detail.onEdit}
                testID="money-detail-edit"
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={t({ id: 'money.detail.delete', message: 'Delete' })}
                variant="destructive"
                onPress={askDelete}
                testID="money-detail-delete"
              />
            </View>
          </View>
        ) : undefined
      }
      testID="money-expense-detail"
    >
      <View style={[styles.body, { gap: th.space.gap16 }]}>
        <View style={[styles.head, { paddingHorizontal: th.space.titleGutter }]}>
          <View style={styles.flex}>
            <Text variant="label" tone="muted" numberOfLines={2}>
              {title}
            </Text>
            <PrivateContent>
              <Text
                variant="hero"
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.5}
                testID="money-detail-amount"
              >
                {formatAmountShown(item.amountMinor, item.currency, locale)}
              </Text>
              <Text variant="label" tone="muted">
                {sub}
              </Text>
              {rate === null ? null : (
                <Text variant="captionMuted" tone="muted" testID="money-detail-rate">
                  {rate}
                </Text>
              )}
            </PrivateContent>
          </View>
          <View style={{ transform: [turn(8)] }}>
            <StickerIcon name={look.icon} size={64} tile={look.bg} />
          </View>
        </View>
        <View style={[styles.tags, { paddingHorizontal: th.space.titleGutter }]}>
          <StatusTag label={categoryLabel(item.category)} tone="voteOpen" />
          {item.fromReceipt ? (
            <StatusTag
              label={t({ id: 'money.detail.receipt', message: 'Split from a receipt scan' })}
              tone="rain"
            />
          ) : null}
          {item.pending === null ? null : (
            <StatusTag
              label={t({ id: 'money.detail.pending', message: 'Waiting to sync' })}
              tone="maybe"
              testID="money-detail-pending"
            />
          )}
        </View>
        <RoomSplitSection detail={detail} fallback={<Shares detail={detail} />} />
        <Changes detail={detail} />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { overflow: 'hidden', paddingVertical: 4 },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  faded: { opacity: 0.5 },
  tabular: { fontVariant: ['tabular-nums'] },
  timeline: { borderLeftWidth: 2, paddingLeft: 14, gap: 10 },
  pair: { flexDirection: 'row', gap: 8 },
});
