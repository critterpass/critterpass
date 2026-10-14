/**
 * Settle up (7.24) and all square (7.28). Open: the guide's line in its own voice ("23 expenses,
 * down to three payments"), one row per payment (payer → payee, amount, status in its colour,
 * Nudge where it may go), how people pay you as chips, the Settled Tokek still to earn, and
 * "Remind everyone" (online only; offline it says why). Square: the green SQUARE stamp lands, then
 * every expense, the books as a spreadsheet, and back to the trip's recap.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PrivateContent } from '@/features/help';
import { useWalletGuide, WalletGuideProvider } from '@/features/bookings';
import { crewAccent, guideCritterKind, IconTile, LineIcon } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  CritterSticker,
  PressableScale,
  Skeleton,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { memberName } from '../data/context';
import { formatAmount } from '../format';
import type { SettleRowModel } from '../settle/model';
import { usePayoutKindLabel } from '../settle/payout-labels';
import { useSettle, type SettleState } from '../settle/use-settle';
import { SettledSquare } from './components/SettledSquare';
import { SettleRemindFooter } from './components/SettleRemindFooter';

type Ready = Extract<SettleState, { kind: 'ready' }>;

function useStatus() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  return (row: SettleRowModel): { label: string; color: string } => {
    switch (row.status) {
      case 'confirmed':
        return {
          label: t({ id: 'money.settle.status.paid', message: 'Paid ✓' }),
          color: th.color.status.booked.text,
        };
      case 'requested':
        return {
          label: t({ id: 'money.settle.status.requested', message: 'Requested' }),
          color: th.color.status.tangerine.text,
        };
      case 'marked_paid':
        return {
          label: t({ id: 'money.settle.status.marked', message: 'Marked paid' }),
          color: th.color.status.rain.text,
        };
      case 'disputed':
        return {
          label: t({ id: 'money.settle.status.disputed', message: 'Disputed' }),
          color: th.color.destructive.text,
        };
      case 'plan':
      case 'pending':
        return {
          label: t({ id: 'money.settle.status.pending', message: 'Pending' }),
          color: th.color.muted,
        };
    }
  };
}

/** One payment on Settle up (also what the privacy test renders). */
export function PaymentCard({
  settle,
  row,
}: {
  readonly settle: Pick<Ready, 'members' | 'onRow' | 'onNudge'>;
  readonly row: SettleRowModel;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const status = useStatus()(row);
  const index = (id: string) => settle.members.find((m) => m.userId === id)?.joinIndex ?? 0;
  const from = memberName(settle.members, row.fromId);
  const to = memberName(settle.members, row.toId);
  const amount = formatAmount(row.amountMinor, row.currency, locale);
  return (
    <PressableScale
      onPress={() => settle.onRow(row)}
      accessibilityRole="button"
      accessibilityLabel={t({
        id: 'money.premium.paymentLabel',
        message: `${from} pays ${to} ${amount}, ${status.label}`,
      })}
      testID={`money-settle-row-${row.key}`}
    >
      <View
        style={[
          styles.payment,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <Avatar name={from} color={crewAccent(index(row.fromId))} uid={row.fromId} size={36} />
        <LineIcon name="navigate" size={16} color={th.color.placeholder} />
        <Avatar name={to} color={crewAccent(index(row.toId))} uid={row.toId} size={28} />
        <View style={styles.flex}>
          <PrivateContent>
            <Text variant="navTitle" style={styles.tabular}>
              {amount}
            </Text>
          </PrivateContent>
          <Text variant="helper" color={status.color}>
            {status.label}
          </Text>
        </View>
        {row.actions.includes('nudge') ? (
          <Button
            alignSelf="auto"
            label={t({ id: 'money.premium.nudge', message: 'Nudge' })}
            size="small"
            onPress={() => settle.onNudge(row)}
            testID={`money-settle-nudge-${row.key}`}
          />
        ) : null}
      </View>
    </PressableScale>
  );
}

function Open({ settle }: { readonly settle: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const kindLabel = usePayoutKindLabel();
  const line = t({
    id: 'money.premium.netted',
    message: plural(settle.rows.length, {
      one: `${settle.expenses} expenses, down to one payment.`,
      other: `${settle.expenses} expenses, down to # payments.`,
    }),
  });
  return (
    <View style={{ gap: th.space.gap16 }}>
      <View style={[styles.guideLine, { paddingHorizontal: th.space.titleGutter }]}>
        <CritterSticker kind={guideCritterKind(guide.id)} name={guide.name} size={30} />
        <Text variant="guide" style={styles.flex}>
          {line}
        </Text>
      </View>
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap10 }}>
        {settle.rows.map((row) => (
          <PaymentCard key={row.key} settle={settle} row={row} />
        ))}
      </View>
      <View style={{ gap: th.space.gap8 }}>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
          {t({ id: 'money.settle.payYou', message: 'How people pay you' })}
        </Text>
        <View style={[styles.chips, { paddingHorizontal: th.space.gutter }]}>
          {settle.kinds.map((kind) => {
            const mine = settle.myKinds.includes(kind);
            return (
              <Button
                key={kind}
                label={kindLabel(kind)}
                size="small"
                variant={mine ? 'primary' : 'floating'}
                onPress={() => settle.onKind()}
                testID={`money-settle-kind-${kind}`}
              />
            );
          })}
        </View>
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
          {t({
            id: 'money.settle.private',
            message: 'Your details are shared only with the person paying.',
          })}
        </Text>
      </View>
      {settle.open > 0 ? (
        <View
          style={[
            styles.reward,
            {
              marginHorizontal: th.space.gutter,
              borderRadius: th.radius.card,
              borderColor: th.color.outlineEmpty,
              backgroundColor: th.color.card,
            },
          ]}
          testID="money-settle-reward"
        >
          <IconTile name="star" bg={th.color.control} color={th.stamp.green.text} size={48} />
          <Text variant="rowText" style={styles.flex}>
            {t({
              id: 'money.premium.reward',
              message: plural(settle.open, {
                one: `One more payment and all ${settle.people} of you get the Settled ${guide.name}.`,
                other: `# more payments and all ${settle.people} of you get the Settled ${guide.name}.`,
              }),
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function SettlePremium({ tripId = null }: { readonly tripId?: string | null }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const settle = useSettle(tripId);
  const title = t({ id: 'money.settle.title', message: 'Settle up' });
  const backLabel = t({ id: 'money.back', message: 'Money' });
  return (
    <WalletGuideProvider tripId={settle.kind === 'ready' ? settle.tripId : null}>
      <PushScreen title={title} backLabel={backLabel} scroll={false} testID="money-settle">
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
          {settle.kind === 'loading' ? (
            <View style={{ padding: th.space.gutter, gap: th.space.gap10 }}>
              <Skeleton height={62} radius={th.radius.card} />
              <Skeleton height={62} radius={th.radius.card} />
            </View>
          ) : settle.kind === 'no-trip' ? (
            <Text variant="body" tone="muted" align="center">
              {t({ id: 'money.premium.noTrip', message: 'Settling up happens inside a trip.' })}
            </Text>
          ) : settle.rows.length === 0 ? (
            settle.expenses > 0 ? (
              <SettledSquare settle={settle} />
            ) : (
              <Text variant="body" tone="muted" align="center" style={{ padding: th.space.gutter }}>
                {t({
                  id: 'money.settle.nothing',
                  message: 'Nothing to settle. Everyone is square.',
                })}
              </Text>
            )
          ) : (
            <Open settle={settle} />
          )}
        </ScrollView>
        {settle.kind === 'ready' && settle.rows.length > 0 ? (
          <SettleRemindFooter settle={settle} />
        ) : null}
      </PushScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 24 },
  flex: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  guideLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
