/**
 * Your plan (9.17): the plan on the night card (or the free plan's own card), the boosts of your
 * trips, the store's own management rows and Cancel Pass+. The store never shows us a card, so
 * the payment row names the store that bills it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URLs, never copy. */
import { useLingui } from '@lingui/react/macro';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { mrzLine } from '@/ui/documents/mrz';
import {
  Button,
  Card,
  ListCard,
  Row,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useBoostLine, usePlanDate, usePlanLine } from '../plan/plan-copy';
import { usePlanScreen } from '../plan/use-plan-screen';
import { useRestoreLine } from '../paywall/purchase-lines';
import { PlanCard } from './components/plan-card';

const REDEEM_URL =
  Platform.OS === 'ios' ? 'https://apps.apple.com/redeem' : 'https://play.google.com/redeem';

export function PlanPremium() {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const props = usePlanScreen();
  const planLine = usePlanLine();
  const planDate = usePlanDate();
  const boostLine = useBoostLine();
  const restored = useRestoreLine()(props.restore);
  const { plan } = props;
  const price = props.price ?? '';
  const paid = plan !== null && plan.kind !== 'free' && plan.kind !== 'expired';
  const title =
    plan?.period === 'yearly'
      ? t({ id: 'monetize.plan.line.yearly', message: 'Yearly' })
      : plan?.period === 'monthly'
        ? t({ id: 'monetize.plan.line.monthly', message: 'Monthly' })
        : t({ id: 'monetize.premium.gift', message: 'A gift' });
  const renews = plan !== null && plan.kind === 'active' ? planDate(plan.date) : null;
  const line =
    plan === null
      ? ''
      : renews === null
        ? planLine(plan)
        : props.price === null
          ? t({ id: 'monetize.plan.renews', message: `Renews ${renews}` })
          : t({ id: 'monetize.premium.renewsPrice', message: `Renews ${renews} · ${price}` });
  const store =
    plan?.platform === 'play'
      ? t({ id: 'monetize.plan.inPlay', message: 'Google Play' })
      : t({ id: 'monetize.plan.inAppStore', message: 'App Store' });

  return (
    <PushScreen
      title={t({ id: 'monetize.plan.title', message: 'Your plan' })}
      backLabel={t({ id: 'monetize.plan.back', message: 'Settings' })}
      testID="plan"
    >
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        {plan === null ? null : paid ? (
          <PlanCard
            eyebrow={t({ id: 'monetize.premium.passPlusEyebrow', message: 'PASS+' })}
            title={title}
            line={line}
            mrz={mrzLine(['CP', 'PASS', 'PLUS', title])}
            iconLabel={t({ id: 'monetize.premium.stampIcon', message: 'The Stamp app icon' })}
            testID="plan-summary"
          />
        ) : (
          <Card padded radius={26} testID="plan-free">
            <View style={{ gap: 6 }}>
              <Text variant="title" testID="plan-summary">
                {planLine(plan)}
              </Text>
              <Text variant="caption" tone="muted">
                {t({
                  id: 'monetize.plan.freeLine',
                  message:
                    'Voting, planning, splitting money, offline maps and every critter are free.',
                })}
              </Text>
              <View style={{ marginTop: 8 }}>
                <Button
                  label={
                    plan.kind === 'expired'
                      ? t({ id: 'monetize.plan.resubscribe', message: 'Get Pass+ again' })
                      : t({ id: 'monetize.plan.see', message: 'See Pass+' })
                  }
                  onPress={props.onUpgrade}
                  testID="plan-upgrade"
                />
              </View>
            </View>
          </Card>
        )}
        {plan?.hasIssue === true ? (
          <Button
            label={t({ id: 'monetize.plan.fixPayment', message: 'Fix the payment' })}
            onPress={props.onBillingIssue}
            testID="plan-fix-payment"
          />
        ) : null}
        {plan !== null &&
        (plan.kind === 'cancelled' || plan.kind === 'paused') &&
        plan.manageHere ? (
          <Button
            label={t({ id: 'monetize.plan.turnBackOn', message: 'Turn Pass+ back on' })}
            variant="secondary"
            onPress={props.onManageStore}
            testID="plan-resubscribe"
          />
        ) : null}
        {plan !== null && plan.platform !== null && !plan.manageHere ? (
          <Text variant="caption" tone="muted" testID="plan-other-store">
            {plan.platform === 'play'
              ? t({
                  id: 'monetize.plan.managePlay',
                  message: 'Billed by Google Play. Manage it there.',
                })
              : t({
                  id: 'monetize.plan.manageAppStore',
                  message: 'Billed by the App Store. Manage it on your iPhone.',
                })}
          </Text>
        ) : null}
        {props.boosts.length > 0 ? (
          <View style={styles.group}>
            <Text variant="label" tone="muted" style={styles.groupLabel}>
              {t({ id: 'monetize.premium.boosts', message: 'Boosts' })}
            </Text>
            <ListCard testID="plan-boosts">
              {props.boosts.map((boost) => (
                <Row
                  key={boost.id}
                  title={boost.destination === '' ? boost.crew : boost.destination}
                  subtitle={boostLine(boost)}
                  trailing={
                    <StatusTag
                      label={
                        boost.on
                          ? t({ id: 'monetize.premium.boostOn', message: 'On' })
                          : t({ id: 'monetize.premium.boostEnded', message: 'Ended' })
                      }
                      tone={boost.on ? 'booked' : 'unopened'}
                    />
                  }
                />
              ))}
            </ListCard>
          </View>
        ) : null}
        {props.storeAvailable ? (
          <View style={styles.group}>
            <Text variant="label" tone="muted" style={styles.groupLabel}>
              {t({ id: 'monetize.plan.manage', message: 'Manage' })}
            </Text>
            <ListCard testID="plan-manage">
              {plan !== null && plan.manageHere ? (
                <Row
                  key="change"
                  title={t({ id: 'monetize.plan.change', message: 'Change plan' })}
                  trailingText={title}
                  onPress={props.onManageStore}
                  testID="plan-change"
                />
              ) : null}
              {plan !== null && plan.manageHere ? (
                <Row
                  key="payment"
                  title={t({ id: 'monetize.plan.payment', message: 'Payment method' })}
                  trailingText={store}
                  onPress={props.onManageStore}
                  testID="plan-payment"
                />
              ) : null}
              <Row
                key="redeem"
                title={t({ id: 'monetize.premium.redeem', message: 'Redeem a code' })}
                onPress={() => void Linking.openURL(REDEEM_URL)}
                testID="plan-redeem"
              />
              <Row
                key="restore"
                title={t({ id: 'monetize.plan.restore', message: 'Restore purchases' })}
                {...(props.restore.status === 'restoring' ? {} : { onPress: props.onRestore })}
                testID="plan-restore"
              />
            </ListCard>
          </View>
        ) : plan !== null ? (
          <Text variant="caption" tone="muted" testID="plan-no-store">
            {t({
              id: 'monetize.plan.noStore',
              message:
                'Purchases aren’t available yet, so there is nothing to buy or restore here.',
            })}
          </Text>
        ) : null}
        {restored === null ? null : (
          <Text
            variant="caption"
            tone="muted"
            accessibilityLiveRegion="polite"
            testID="plan-restore-line"
          >
            {restored}
          </Text>
        )}
        {plan?.canCancel === true && plan.manageHere ? (
          <View style={styles.cancel}>
            <TextButton
              label={t({ id: 'monetize.plan.cancel', message: 'Cancel Pass+' })}
              color={th.color.destructive.listAction}
              onPress={props.onCancel}
              testID="plan-cancel"
            />
          </View>
        ) : null}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  groupLabel: { paddingHorizontal: 6 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
});
