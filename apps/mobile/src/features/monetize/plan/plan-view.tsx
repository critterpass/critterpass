/**
 * Your plan (4d-1): the pass card for whatever the person has (free, monthly, yearly, ending,
 * paused, a payment problem, a gift), the boosts of their trips, and the rows that manage it.
 * Everything that changes a subscription opens the store that bills it; a plan billed by the
 * other store says where to manage it instead.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Tag } from '@/ui/plan/ActionPill';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { RestoreState } from '../data/use-billing';
import { useRestoreLine } from '../paywall/purchase-copy';
import { PinkLink } from './pink-link';
import { useBoostLine, usePlanDate, usePlanLine } from './plan-copy';
import type { BoostLine, PlanModel } from './plan-model';

export interface PlanViewProps {
  /** Null while the rows have not been read yet. */
  readonly plan: PlanModel | null;
  /** The store's price for the current plan, when it has one. */
  readonly price: string | null;
  readonly boosts: readonly BoostLine[];
  readonly restore: RestoreState;
  /** False where there is no store to restore from or manage in. */
  readonly storeAvailable: boolean;
  readonly onBack?: (() => void) | undefined;
  readonly onUpgrade: () => void;
  readonly onManageStore: () => void;
  readonly onRestore: () => void;
  readonly onCancel: () => void;
  readonly onBillingIssue: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['20'] },
  boosts: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  boost: { padding: t.size.cardInner.max, gap: t.space['4'] },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  grow: { flex: 1 },
}));

export function PlanView(props: PlanViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const planLine = usePlanLine();
  const planDate = usePlanDate();
  const boostLine = useBoostLine();
  const restoreLine = useRestoreLine();
  const { plan } = props;
  const restored = restoreLine(props.restore);

  const eyebrow =
    plan === null
      ? ''
      : plan.kind === 'free' || plan.kind === 'expired'
        ? t({ id: 'monetize.plan.eyebrow.free', message: 'FREE' })
        : plan.period === 'yearly'
          ? t({ id: 'monetize.plan.eyebrow.yearly', message: 'YEARLY' })
          : plan.period === 'monthly'
            ? t({ id: 'monetize.plan.eyebrow.monthly', message: 'MONTHLY' })
            : t({ id: 'monetize.plan.eyebrow.gift', message: 'A GIFT' });
  const summary = plan === null ? '' : planLine(plan);
  // The card's eyebrow already names the period, so a renewing plan reads "Renews <date>" there.
  const renews = plan !== null && plan.kind === 'active' ? planDate(plan.date) : null;
  const cardLine =
    renews === null ? summary : t({ id: 'monetize.plan.renews', message: `Renews ${renews}` });
  const hasPassCard = plan !== null && plan.kind !== 'free' && plan.kind !== 'expired';

  const otherStore =
    plan !== null && plan.platform !== null && !plan.manageHere
      ? plan.platform === 'play'
        ? t({ id: 'monetize.plan.managePlay', message: 'Billed by Google Play. Manage it there.' })
        : t({
            id: 'monetize.plan.manageAppStore',
            message: 'Billed by the App Store. Manage it on your iPhone.',
          })
      : null;

  const rows: SettingsRow[] = [];
  if (plan !== null && plan.manageHere && props.storeAvailable) {
    rows.push({
      key: 'change',
      kind: 'value',
      title: t({ id: 'monetize.plan.change', message: 'Change plan' }),
      value:
        plan.period === 'yearly'
          ? t({ id: 'monetize.plan.line.yearly', message: 'Yearly' })
          : t({ id: 'monetize.plan.line.monthly', message: 'Monthly' }),
      onPress: props.onManageStore,
    });
    rows.push({
      key: 'payment',
      kind: 'value',
      title: t({ id: 'monetize.plan.payment', message: 'Payment method' }),
      value:
        plan.platform === 'play'
          ? t({ id: 'monetize.plan.inPlay', message: 'Google Play' })
          : t({ id: 'monetize.plan.inAppStore', message: 'App Store' }),
      onPress: props.onManageStore,
    });
  }
  if (props.storeAvailable) {
    rows.push({
      key: 'restore',
      kind: 'value',
      title: t({ id: 'monetize.plan.restore', message: 'Restore purchases' }),
      value: '',
      onPress: props.onRestore,
      disabled: props.restore.status === 'restoring',
    });
  }

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'monetize.plan.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="plan-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'monetize.plan.title', message: 'Your plan' })}
        </Text>
        {plan === null ? <Skeleton preset="lines" testID="plan-loading" /> : null}
        {hasPassCard ? (
          <Card tone="yellow" halftone testID={`plan-card-${plan.kind}`}>
            <Row align="center" gap="12">
              <Stack gap="4" style={styles.grow}>
                <Text variant="eyebrow" color={theme.color.ink[850]}>
                  {eyebrow}
                </Text>
                <Text variant="h2" color={theme.color.ink[850]}>
                  {t({ id: 'monetize.paywall.passPlus', message: 'Pass+' })}
                </Text>
                <Text variant="bodySm" color={theme.color.ink[850]} testID="plan-summary">
                  {props.price !== null && plan.kind === 'active'
                    ? `${cardLine} · ${props.price}`
                    : cardLine}
                </Text>
              </Stack>
              <Sticker kind="gecko" name="Tokek" size={56} />
            </Row>
          </Card>
        ) : null}
        {plan !== null && !hasPassCard ? (
          <Card tone="raised" testID={`plan-card-${plan.kind}`}>
            <Stack gap="12">
              <Stack gap="4">
                <Text variant="eyebrow">{eyebrow}</Text>
                <Text variant="h3" testID="plan-summary">
                  {summary}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {t({
                    id: 'monetize.plan.freeLine',
                    message:
                      'Voting, planning, splitting money, offline maps and every critter are free.',
                  })}
                </Text>
              </Stack>
              <PillButton
                label={
                  plan.kind === 'expired'
                    ? t({ id: 'monetize.plan.resubscribe', message: 'Get Pass+ again' })
                    : t({ id: 'monetize.plan.see', message: 'See Pass+' })
                }
                onPress={props.onUpgrade}
                block
                testID="plan-upgrade"
              />
            </Stack>
          </Card>
        ) : null}
        {plan?.hasIssue ? (
          <PillButton
            label={t({ id: 'monetize.plan.fixPayment', message: 'Fix the payment' })}
            tone="orange"
            onPress={props.onBillingIssue}
            block
            testID="plan-fix-payment"
          />
        ) : null}
        {plan !== null &&
        (plan.kind === 'cancelled' || plan.kind === 'paused') &&
        plan.manageHere ? (
          <PillButton
            label={t({ id: 'monetize.plan.turnBackOn', message: 'Turn Pass+ back on' })}
            variant="secondary"
            onPress={props.onManageStore}
            block
            testID="plan-resubscribe"
          />
        ) : null}
        {otherStore === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="plan-other-store">
            {otherStore}
          </Text>
        )}
        {props.boosts.length > 0 ? (
          <Stack gap="8">
            <Text variant="eyebrow">{t({ id: 'monetize.plan.boosts', message: 'BOOSTS' })}</Text>
            <View style={styles.boosts} testID="plan-boosts">
              {props.boosts.map((boost, index) => {
                const window = boostLine(boost);
                return (
                  <View key={boost.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Row style={styles.boost} align="center" gap="12">
                      <Stack gap="4" style={styles.grow}>
                        <Text variant="rowTitle">
                          {boost.crew === ''
                            ? boost.destination
                            : `${boost.destination} · ${boost.crew}`}
                        </Text>
                        <Text variant="bodySm" color={theme.semantic.text.secondary}>
                          {window}
                        </Text>
                      </Stack>
                      {boost.on ? (
                        <Tag
                          label={t({ id: 'monetize.plan.boost.on', message: 'ON' })}
                          color={theme.color.pink}
                        />
                      ) : (
                        <Text variant="label" color={theme.semantic.text.tertiary}>
                          {t({ id: 'monetize.plan.boost.endedTag', message: 'ENDED' })}
                        </Text>
                      )}
                    </Row>
                  </View>
                );
              })}
            </View>
          </Stack>
        ) : null}
        {rows.length > 0 ? (
          <SettingsGroup
            title={t({ id: 'monetize.plan.manage', message: 'Manage' })}
            rows={rows}
            testID="plan-manage"
          />
        ) : null}
        {plan !== null && !props.storeAvailable ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="plan-no-store">
            {t({
              id: 'monetize.plan.noStore',
              message:
                'Purchases aren’t available yet, so there is nothing to buy or restore here.',
            })}
          </Text>
        ) : null}
        {restored === null ? null : (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            accessibilityLiveRegion="polite"
            testID="plan-restore-line"
          >
            {restored}
          </Text>
        )}
        {plan?.canCancel && plan.manageHere ? (
          <PinkLink
            label={t({ id: 'monetize.plan.cancel', message: 'Cancel Pass+' })}
            onPress={props.onCancel}
            testID="plan-cancel"
          />
        ) : null}
      </ScrollView>
    </Scaffold>
  );
}
