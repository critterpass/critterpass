/**
 * The card didn't go through (9.24): the store's card art (the store never tells us the card, so
 * it names the store), what stays on and until when, boosts untouched, Tokek's promise, and
 * Update payment (in the store) or Try again. Coming back from the store re-checks.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  Card,
  GuideNote,
  LoadingCritter,
  Row,
  Tag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePlanDate } from '../plan/plan-copy';
import type { BoostLine, PlanModel } from '../plan/plan-model';
import { MONETIZE_ROUTES } from '../routes';
import { MONETIZE_INK } from './monetize-palette';

export interface BillingIssueViewProps {
  /** Null while the rows have not been read yet. */
  readonly plan: PlanModel | null;
  readonly boosts: readonly BoostLine[];
  /** A re-check with the store is running. */
  readonly checking: boolean;
  /** Update the payment, in the store. */
  readonly onUpdate: () => void;
  readonly onTryAgain: () => void;
}

export function BillingIssuePremiumView({
  plan,
  boosts,
  checking,
  onUpdate,
  onTryAgain,
}: BillingIssueViewProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const planDate = usePlanDate();
  const back = () => goBackOr(MONETIZE_ROUTES.plan);
  const backLabel = t({ id: 'monetize.back.plan', message: 'Your plan' });
  if (plan === null) {
    return (
      <PushScreen title={backLabel} backLabel={backLabel} testID="billing-issue-loading">
        <LoadingCritter
          label={t({ id: 'monetize.premium.planLoading', message: 'Tokek is reading your plan…' })}
        />
      </PushScreen>
    );
  }
  const recovered = !plan.hasIssue;
  const until = planDate(plan.date);
  const running = boosts.filter((boost) => boost.on);
  const store =
    plan.platform === 'play'
      ? t({ id: 'monetize.plan.inPlay', message: 'Google Play' })
      : t({ id: 'monetize.plan.inAppStore', message: 'App Store' });

  return (
    <PushScreen title={backLabel} backLabel={backLabel} testID="billing-issue">
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        {recovered ? (
          <View style={{ gap: 8 }} testID="billing-issue-recovered">
            <Text variant="display" accessibilityRole="header">
              {plan.passPlus
                ? t({ id: 'monetize.issue.recovered', message: 'All sorted' })
                : t({ id: 'monetize.issue.none', message: 'Nothing to fix' })}
            </Text>
            <Text variant="rowText" tone="muted">
              {plan.passPlus
                ? t({
                    id: 'monetize.issue.recoveredLine',
                    message: 'The payment went through and Pass+ is on.',
                  })
                : t({
                    id: 'monetize.issue.noneLine',
                    message: 'There is no payment waiting on you.',
                  })}
            </Text>
            <View style={{ marginTop: 16 }}>
              <Button
                label={t({ id: 'monetize.issue.done', message: 'Done' })}
                onPress={back}
                testID="billing-issue-done"
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.art} accessible accessibilityLabel={store}>
              <View style={styles.chip} />
              <Text variant="headline" color={MONETIZE_INK.cardText} style={styles.cardText}>
                {store}
              </Text>
              <View style={styles.sticker}>
                <Tag
                  label={t({ id: 'monetize.premium.declined', message: 'Declined' })}
                  color={th.accent.pink}
                  rotate={10}
                />
              </View>
            </View>
            <Text variant="emptyTitle" accessibilityRole="header">
              {t({ id: 'monetize.premium.cardDidntGo', message: 'The card didn’t go through' })}
            </Text>
            <Text variant="rowText" tone="muted" testID="billing-issue-line">
              {plan.kind === 'grace'
                ? t({
                    id: 'monetize.issue.grace',
                    message:
                      'Your Pass+ renewal wasn’t paid. Everything stays on while you sort it with the store.',
                  })
                : t({
                    id: 'monetize.issue.off',
                    message:
                      'Your Pass+ renewal wasn’t paid, so Pass+ is off for now. It comes back as soon as the payment goes through.',
                  })}
            </Text>
            <Card radius={22} style={{ overflow: 'hidden' }}>
              <Row
                title={
                  plan.kind === 'grace'
                    ? t({ id: 'monetize.issue.staysOn', message: 'Pass+ stays on until' })
                    : t({ id: 'monetize.issue.passPlus', message: 'Pass+' })
                }
                trailingText={
                  plan.kind === 'grace'
                    ? (until ?? '')
                    : t({ id: 'monetize.issue.offTag', message: 'Off' })
                }
                testID="billing-issue-until"
              />
              {running.map((boost) => (
                <View
                  key={boost.id}
                  style={{ borderTopWidth: th.size.hairline, borderTopColor: th.color.hairline }}
                >
                  <Row
                    title={t({ id: 'monetize.issue.boost', message: `${boost.destination} boost` })}
                    trailing={
                      <Text variant="pillSmall" color={th.color.status.booked.text}>
                        {t({
                          id: 'monetize.premium.paidNotAffected',
                          message: 'Paid, not affected',
                        })}
                      </Text>
                    }
                  />
                </View>
              ))}
            </Card>
            <GuideNote
              name="Tokek"
              text={t({
                id: 'monetize.premium.noLock',
                message: 'Nothing gets locked mid-trip. Promise.',
              })}
            />
            {plan.manageHere ? null : (
              <Text variant="caption" tone="muted" testID="billing-issue-elsewhere">
                {plan.platform === 'play'
                  ? t({
                      id: 'monetize.issue.fixPlay',
                      message: 'This plan is billed by Google Play. Update the payment there.',
                    })
                  : t({
                      id: 'monetize.issue.fixAppStore',
                      message:
                        'This plan is billed by the App Store. Update the payment on your iPhone.',
                    })}
              </Text>
            )}
            <View style={{ gap: 6, marginTop: 4 }}>
              {plan.manageHere ? (
                <Button
                  label={t({ id: 'monetize.premium.updateCard', message: 'Update card' })}
                  onPress={onUpdate}
                  testID="billing-issue-update"
                />
              ) : null}
              <View style={{ alignItems: 'center' }}>
                <TextButton
                  label={
                    checking
                      ? t({ id: 'monetize.issue.checking', message: 'Checking…' })
                      : t({ id: 'monetize.issue.tryAgain', message: 'Try again' })
                  }
                  onPress={onTryAgain}
                  disabled={checking}
                  testID="billing-issue-try-again"
                />
              </View>
            </View>
          </>
        )}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  art: {
    alignSelf: 'center',
    width: 300,
    height: 186,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'flex-end',
    experimental_backgroundImage: 'linear-gradient(160deg, #2a2b33, #1c1d24)',
    boxShadow: '0 20px 40px -16px rgba(20,22,40,0.5)',
    transform: [{ rotate: '-5deg' }],
    marginVertical: 12,
  },
  chip: {
    position: 'absolute',
    left: 20,
    top: 26,
    width: 40,
    height: 30,
    borderRadius: 6,
    backgroundColor: MONETIZE_INK.cardChip,
  },
  cardText: { letterSpacing: 2 },
  sticker: { position: 'absolute', right: 16, top: 18 },
});
