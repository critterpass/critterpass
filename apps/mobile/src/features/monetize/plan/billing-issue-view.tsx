/**
 * The payment didn't go through (4d-3). It says only what the server's rows say: whether Pass+ is
 * still on and until when. It never shows a card number, an expiry or a reason; fixing the
 * payment happens in the store, and coming back re-checks.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { usePlanDate } from './plan-copy';
import type { BoostLine, PlanModel } from './plan-model';

export interface BillingIssueViewProps {
  readonly plan: PlanModel;
  /** Boosts that are running: already paid, so the failed renewal does not touch them. */
  readonly boosts: readonly BoostLine[];
  /** A re-check is on its way to the server. */
  readonly checking: boolean;
  /** False when the plan is billed by the other store: it has to be fixed there. */
  readonly canFixHere: boolean;
  readonly onUpdate: () => void;
  readonly onTryAgain: () => void;
  readonly onDone: () => void;
  readonly onBack?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  content: {
    flexGrow: 1,
    padding: t.size.gutter,
    paddingBottom: t.space['32'],
    gap: t.space['20'],
  },
  card: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: { padding: t.size.cardInner.max, gap: t.space['12'] },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  grow: { flex: 1 },
  spacer: { flex: 1 },
}));

export function BillingIssueView(props: BillingIssueViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const planDate = usePlanDate();
  const { plan } = props;
  const recovered = !plan.hasIssue;
  const until = planDate(plan.date);
  const running = props.boosts.filter((boost) => boost.on);

  // What is on right now: Pass+ and the boosts a failed renewal never touches.
  const card = (
    <View style={styles.card}>
      <Row style={styles.row} align="center" justify="space-between">
        <Text variant="rowTitle" style={styles.grow}>
          {plan.kind === 'grace'
            ? t({ id: 'monetize.issue.staysOn', message: 'Pass+ stays on until' })
            : t({ id: 'monetize.issue.passPlus', message: 'Pass+' })}
        </Text>
        <Text
          variant="rowTitle"
          color={recovered ? theme.semantic.state.success : theme.color.orange}
          testID="billing-issue-until"
        >
          {recovered
            ? t({ id: 'monetize.issue.onTag', message: 'On' })
            : plan.kind === 'grace'
              ? (until ?? '')
              : t({ id: 'monetize.issue.offTag', message: 'Off' })}
        </Text>
      </Row>
      {running.map((boost) => (
        <View key={boost.id}>
          <View style={styles.divider} />
          <Row style={styles.row} align="center">
            <Stack gap="4" style={styles.grow}>
              <Text variant="rowTitle">
                {t({
                  id: 'monetize.issue.boost',
                  message: `${boost.destination} boost`,
                })}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'monetize.issue.boostLine',
                  message: 'Already paid, not affected',
                })}
              </Text>
            </Stack>
            <Icon name="check" size={20} color={theme.semantic.state.success} decorative />
          </Row>
        </View>
      ))}
    </View>
  );

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="billing-issue">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'monetize.cancel.back', message: 'Your plan' })}
          onPress={props.onBack}
          testID="billing-issue-back"
        />
        {recovered ? (
          <Stack gap="10" testID="billing-issue-recovered">
            <Icon name="check" size={40} color={theme.semantic.state.success} decorative />
            <Text variant="h1" accessibilityRole="header">
              {plan.passPlus
                ? t({ id: 'monetize.issue.recovered', message: 'All sorted' })
                : t({ id: 'monetize.issue.none', message: 'Nothing to fix' })}
            </Text>
            <Text variant="bodyLg" color={theme.semantic.text.secondary}>
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
            {plan.passPlus ? card : null}
          </Stack>
        ) : (
          <>
            <Text variant="h1" accessibilityRole="header">
              {t({ id: 'monetize.issue.title', message: 'The payment didn’t go through' })}
            </Text>
            <Text
              variant="bodyLg"
              color={theme.semantic.text.secondary}
              testID="billing-issue-line"
            >
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
            {card}
            {props.canFixHere ? null : (
              <Text
                variant="bodySm"
                color={theme.semantic.text.secondary}
                testID="billing-issue-elsewhere"
              >
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
          </>
        )}
        <View style={styles.spacer} />
        {recovered ? (
          <PillButton
            label={t({ id: 'monetize.issue.done', message: 'Done' })}
            onPress={props.onDone}
            block
            testID="billing-issue-done"
          />
        ) : (
          <Stack gap="12">
            {props.canFixHere ? (
              <PillButton
                label={t({ id: 'monetize.issue.update', message: 'Update payment' })}
                tone="orange"
                onPress={props.onUpdate}
                block
                testID="billing-issue-update"
              />
            ) : null}
            <TextLink
              label={
                props.checking
                  ? t({ id: 'monetize.issue.checking', message: 'Checking…' })
                  : t({ id: 'monetize.issue.tryAgain', message: 'Try again' })
              }
              onPress={props.onTryAgain}
              disabled={props.checking}
              testID="billing-issue-try-again"
            />
          </Stack>
        )}
      </ScrollView>
    </Scaffold>
  );
}
