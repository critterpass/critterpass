/**
 * One payment (7.25 pay someone, 7.26 owed to you). Paying: the payee's avatar, the amount large,
 * how they get paid (a switch over their methods and cash; revealed online only), the amount paid
 * when it is only part, and "I've paid Maya" docked above the keyboard. Owed: "Jordan owes you",
 * the steps so far as a timeline (asked, marked paid, you confirm), then request, "I got it",
 * nudge or "It didn't arrive" (asked first: it tells a crewmate their payment is disputed).
 */
import type { PaymentMethod } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { amountText } from '@/data/money/amount-digits';
import { PrivateContent } from '@/features/help';
import { crewAccent } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  EmptyState,
  SegmentedControl,
  Skeleton,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { formatAmountShown } from '../format';
import { usePayoutKindLabel } from '../settle/payout-labels';
import { usePayment, type PaymentState } from '../settle/use-payment';
import { PaymentOwed } from './components/PaymentOwed';
import { PayoutMethodBlock } from './components/PayoutMethodBlock';
import { labelKindOf, methodOf } from './payment-method';

type Ready = Extract<PaymentState, { kind: 'ready' }>;

function Paying({ pay }: { readonly pay: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const kindLabel = usePayoutKindLabel();
  const { row, reveal, toName } = pay;
  const payee = toName;
  const revealed = reveal.kind === 'ok' ? reveal.methods : [];
  const methods = [...revealed.map((m) => methodOf(m.kind)), 'cash' as const].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  const labelOf = (method: PaymentMethod) =>
    method === 'other'
      ? t({ id: 'money.pay.other', message: 'Other' })
      : kindLabel(labelKindOf(method));
  const shown = revealed.find((m) => methodOf(m.kind) === pay.method);
  return (
    <View style={{ gap: th.space.gap16 }}>
      {methods.length > 1 ? (
        <View style={{ paddingHorizontal: th.space.gap16 }}>
          <SegmentedControl<PaymentMethod>
            accessibilityLabel={t({ id: 'money.pay.how', message: 'How you paid' })}
            options={methods.map((value) => ({ value, label: labelOf(value) }))}
            value={methods.includes(pay.method) ? pay.method : 'cash'}
            onChange={pay.onMethod}
            testID="money-pay-method"
          />
        </View>
      ) : null}
      {shown !== undefined ? (
        <PayoutMethodBlock
          method={shown}
          row={row}
          label={labelOf(pay.method)}
          toName={toName}
          onCopy={pay.onCopy}
          onOpen={pay.onOpen}
        />
      ) : pay.method === 'cash' ? (
        <Text variant="body" tone="muted" align="center">
          {t({ id: 'money.pay.cash', message: 'Hand it over in person.' })}
        </Text>
      ) : null}
      {reveal.kind === 'ok' ? null : (
        <Text
          variant="rowText"
          tone="muted"
          align="center"
          style={{ paddingHorizontal: th.space.titleGutter }}
          testID={`money-pay-reveal-${reveal.kind}`}
        >
          {reveal.kind === 'loading'
            ? t({ id: 'money.pay.revealLoading', message: `Getting how ${payee} gets paid…` })
            : reveal.kind === 'offline'
              ? t({
                  id: 'money.pay.revealOffline',
                  message: `Connect to see how ${payee} gets paid. You can still mark it paid.`,
                })
              : t({
                  id: 'money.pay.revealNone',
                  message: `Once ${payee} requests it, their payment details show here. Cash works any time.`,
                })}
        </Text>
      )}
      <View style={{ paddingHorizontal: th.space.gutter }}>
        <TextField
          accessibilityLabel={t({ id: 'money.pay.amount', message: 'Amount paid' })}
          value={amountText(pay.amountDigits, row.currency, locale)}
          onChangeText={(text) => pay.onAmount(text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          helper={t({
            id: 'money.pay.amountHint',
            message: 'Paying part of it? The rest stays open.',
          })}
          {...(pay.amountValid
            ? {}
            : { error: t({ id: 'money.premium.amountTooMuch', message: 'More than is owed' }) })}
          testID="money-pay-amount"
        />
      </View>
    </View>
  );
}

export function PaymentPremium({
  id,
  tripId = null,
}: {
  readonly id: string;
  readonly tripId?: string | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const pay = usePayment(id, tripId);
  const title = t({ id: 'money.pay.back', message: 'Settle up' });
  if (pay.kind !== 'ready') {
    return (
      <PushScreen title={title} backLabel={title} testID={`money-payment-${pay.kind}`}>
        {pay.kind === 'loading' ? (
          <View style={{ padding: th.space.gutter }}>
            <Skeleton height={200} radius={th.radius.cardLarge} />
          </View>
        ) : (
          <EmptyState
            title={t({
              id: 'money.premium.paymentGone',
              message: 'This payment is settled or gone',
            })}
            line={t({
              id: 'money.premium.paymentGoneLine',
              message: 'Settle up shows what is still open.',
            })}
          />
        )}
      </PushScreen>
    );
  }
  const { row, fromName, toName } = pay;
  const payer = fromName;
  const payee = toName;
  const paying = row.role === 'payer' && row.actions.includes('pay');
  const other = row.role === 'payer' ? toName : fromName;
  const amount = formatAmountShown(row.amountMinor, row.currency, locale);
  return (
    <PushScreen title={title} backLabel={title} scroll={false} testID="money-payment">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, gap: th.space.gap16 }}
      >
        <View style={[styles.who, { paddingHorizontal: th.space.titleGutter }]}>
          <Avatar
            name={other}
            color={crewAccent(pay.joinIndexOf(row.role === 'payer' ? row.toId : row.fromId))}
            size={56}
            ringed
          />
          <PrivateContent>
            <Text
              variant="hero"
              align="center"
              style={styles.tabular}
              testID="money-payment-amount"
            >
              {amount}
            </Text>
          </PrivateContent>
          <Text variant="body" tone="muted" align="center">
            {row.role === 'payer'
              ? t({ id: 'money.premium.toWhom', message: `to ${toName}` })
              : row.role === 'payee'
                ? t({ id: 'money.pay.titleOwed', message: `${payer} owes you` })
                : t({ id: 'money.pay.titleOther', message: `${payer} pays ${payee}` })}
          </Text>
        </View>
        {paying ? <Paying pay={pay} /> : null}
        {row.role === 'payer' && row.status === 'marked_paid' ? (
          <Text
            variant="rowText"
            tone="muted"
            align="center"
            style={{ paddingHorizontal: th.space.titleGutter }}
          >
            {t({
              id: 'money.pay.waiting',
              message: `Waiting for ${payee} to confirm. It confirms itself after seven days.`,
            })}
          </Text>
        ) : null}
        {row.role === 'payee' ? <PaymentOwed pay={pay} /> : null}
      </ScrollView>
      {paying ? (
        <KeyboardStickyFooter>
          <View
            style={{
              paddingHorizontal: th.space.titleGutter,
              paddingBottom: th.space.gap12,
              gap: th.space.gap6,
            }}
          >
            <Button
              label={t({ id: 'money.premium.ivePaid', message: `I've paid ${toName}` })}
              disabled={!pay.amountValid}
              loading={pay.busy}
              onPress={pay.onMarkPaid}
              testID="money-pay-mark"
            />
            <Text variant="captionMuted" tone="muted" align="center">
              {t({
                id: 'money.premium.confirmsWhen',
                message: `${toName} confirms when it lands. Paid part? The rest stays open.`,
              })}
            </Text>
          </View>
        </KeyboardStickyFooter>
      ) : null}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  who: { alignItems: 'center', gap: 6 },
  tabular: { fontVariant: ['tabular-nums'] },
});
