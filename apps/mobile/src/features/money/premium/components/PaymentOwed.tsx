/**
 * The payee's side of a payment (7.26): the steps so far as a timeline (asked, marked paid, you
 * confirm), the guide's note while it waits on you, then request, "I got it", nudge or "It didn't
 * arrive" (asked first: it tells a crewmate their payment is disputed).
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Icon, ring, Text, usePremiumTheme } from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import type { PaymentState } from '../../settle/use-payment';

type Ready = Extract<PaymentState, { kind: 'ready' }>;

function Step(props: {
  readonly title: string;
  readonly state: 'done' | 'current' | 'next';
  readonly last: boolean;
}) {
  const th = usePremiumTheme();
  const node =
    props.state === 'done'
      ? { backgroundColor: th.accent.mint }
      : props.state === 'current'
        ? { backgroundColor: th.color.card, boxShadow: ring(3, th.accent.sun, true) }
        : { backgroundColor: th.color.card, boxShadow: ring(2, th.color.outlineEmpty, true) };
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.node, node]}>
          {props.state === 'done' ? (
            <Icon name="check" size={12} color={th.color.onAccent} />
          ) : null}
        </View>
        {props.last ? null : (
          <View style={[styles.connector, { backgroundColor: th.color.fieldBorder }]} />
        )}
      </View>
      <Text variant="rowTitle" style={props.state === 'next' ? styles.future : null}>
        {props.title}
      </Text>
    </View>
  );
}

export function PaymentOwed({ pay }: { readonly pay: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { row, fromName } = pay;
  const asked = row.status !== 'plan' && row.status !== 'pending';
  const marked = row.status === 'marked_paid' || row.status === 'confirmed';
  const confirmed = row.status === 'confirmed';
  const steps = [
    {
      key: 'asked',
      title: t({ id: 'money.premium.stepAsked', message: `You asked ${fromName}` }),
      done: asked,
    },
    {
      key: 'marked',
      title: t({ id: 'money.premium.stepMarked', message: `${fromName} marked it paid` }),
      done: marked,
    },
    {
      key: 'confirm',
      title: t({ id: 'money.premium.stepConfirm', message: 'You confirm it landed' }),
      done: confirmed,
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  const dispute = () =>
    void confirmAlert({
      title: t({ id: 'money.premium.disputeTitle', message: `Tell ${fromName} it didn't arrive?` }),
      message: t({
        id: 'money.premium.disputeLine',
        message: 'The payment opens again and they are told.',
      }),
      confirm: t({ id: 'money.pay.dispute', message: "It didn't arrive" }),
      cancel: t({ id: 'money.premium.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) pay.onDispute();
    });
  return (
    <View style={{ gap: th.space.gap16 }}>
      <View
        style={[
          styles.timeline,
          {
            marginHorizontal: th.space.gutter,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
        testID="money-pay-timeline"
      >
        {steps.map((step, index) => (
          <Step
            key={step.key}
            title={step.title}
            state={step.done ? 'done' : index === current ? 'current' : 'next'}
            last={index === steps.length - 1}
          />
        ))}
      </View>
      {row.status === 'marked_paid' ? (
        <View style={{ paddingHorizontal: th.space.gutter }}>
          <Banner
            tone="guide"
            text={t({
              id: 'money.premium.waitingYou',
              message: 'Waiting for you to confirm. It confirms itself after seven days.',
            })}
          />
        </View>
      ) : null}
      {row.note === null ? null : (
        <Text
          variant="rowText"
          color={th.color.destructive.text}
          style={{ paddingHorizontal: th.space.titleGutter }}
        >
          {row.note}
        </Text>
      )}
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap8 }}>
        {row.actions.includes('request') ? (
          <Button
            label={t({ id: 'money.pay.request', message: 'Request it' })}
            loading={pay.busy}
            onPress={pay.onRequest}
            testID="money-pay-request"
          />
        ) : null}
        {row.actions.includes('confirm') ? (
          <Button
            label={t({ id: 'money.pay.confirm', message: 'I got it' })}
            loading={pay.busy}
            onPress={pay.onConfirm}
            testID="money-pay-confirm"
          />
        ) : null}
        <View style={styles.pair}>
          {row.actions.includes('nudge') ? (
            <View style={styles.flex}>
              <Button
                label={t({ id: 'money.pay.nudge', message: `Nudge ${fromName}` })}
                variant="secondary"
                disabled={pay.busy}
                onPress={pay.onNudge}
                testID="money-pay-nudge"
              />
            </View>
          ) : null}
          {row.actions.includes('dispute') ? (
            <View style={styles.flex}>
              <Button
                label={t({ id: 'money.pay.dispute', message: "It didn't arrive" })}
                variant="destructive"
                disabled={pay.busy}
                onPress={dispute}
                testID="money-pay-dispute"
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { paddingVertical: 16, paddingHorizontal: 16 },
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 22 },
  node: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, height: 30 },
  future: { opacity: 0.5 },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
