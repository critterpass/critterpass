/**
 * The guide's plan card (3j-1): its swaps deal in one at a time (what goes, struck through with
 * its time, and what comes in), the cost change, then PROPOSE TO GROUP (the change set goes to the
 * crew as a vote in crew chat) or JUST ME (applied to the asker's own day only). REVIEW opens the
 * full change review. Once sent or applied the card says so instead of offering the actions.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { patterns } from '@/motion';
import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';

import type { PlanCardModel, PlanSwap } from '../data/use-plan-card';

export type PlanCardOutcome = 'open' | 'sent' | 'applied' | 'closed';

export function outcomeOf(state: PlanCardModel['state']): PlanCardOutcome {
  if (state === 'draft') return 'open';
  if (state === 'voting') return 'sent';
  if (state === 'approved' || state === 'applying') return 'applied';
  return 'closed';
}

const useStyles = makeStyles((t) => ({
  divider: { height: 1, backgroundColor: t.semantic.border.decorative },
  struck: { textDecorationLine: 'line-through' },
  card: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
  },
}));

function SwapRow({ swap, index }: { readonly swap: PlanSwap; readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const dealt = patterns.useDeal({ active: true, index: index * 2 });
  const before =
    swap.before === null
      ? null
      : [
          swap.before.time,
          swap.before.label === ''
            ? t({ id: 'guide.plan.anItem', message: 'A plan item' })
            : swap.before.label,
        ]
          .filter(Boolean)
          .join(' ');
  const afterLabel =
    swap.after === null
      ? t({ id: 'guide.plan.removed', message: 'Taken out of the plan' })
      : swap.after.label === ''
        ? t({ id: 'guide.plan.newItem', message: 'Something new' })
        : swap.after.label;
  return (
    <Animated.View style={dealt} testID={`guide-plan-swap-${index}`}>
      <Stack gap="4">
        {before === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.tertiary} style={styles.struck}>
            {before}
          </Text>
        )}
        <Text variant="title">{`→ ${upper(afterLabel, i18n.locale)}`}</Text>
        {swap.reason === '' ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {swap.reason}
          </Text>
        )}
      </Stack>
    </Animated.View>
  );
}

/** "+$22" (whole units), or null when nobody's share moves or it differs per person. */
export function costLine(model: PlanCardModel, locale: string): string | null {
  if (model.eachMinor === null || model.currency === null || model.eachMinor === 0) return null;
  try {
    const digits =
      new Intl.NumberFormat('en', { style: 'currency', currency: model.currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: model.currency,
      signDisplay: 'always',
      maximumFractionDigits: 0,
    }).format(model.eachMinor / 10 ** digits);
  } catch {
    return null;
  }
}

export interface PlanCardViewProps {
  readonly model: PlanCardModel;
  readonly canPropose: boolean;
  readonly onPropose: () => void;
  readonly onJustMe: () => void;
  readonly onReview: () => void;
  readonly busy?: boolean;
}

export function PlanCardView({
  model,
  canPropose,
  onPropose,
  onJustMe,
  onReview,
  busy = false,
}: PlanCardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const outcome = outcomeOf(model.state);
  const cost = costLine(model, i18n.locale);
  return (
    <View style={styles.card} testID={`guide-plan-card-${model.changesetId}`}>
      <Stack gap="12">
        {model.swaps.map((swap, index) => (
          <Stack key={`${swap.target}-${index}`} gap="12">
            {index === 0 ? null : <View style={styles.divider} />}
            <SwapRow swap={swap} index={index} />
          </Stack>
        ))}
        {model.swaps.length > 0 ? <View style={styles.divider} /> : null}
        <Row justify="space-between" align="center">
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {cost === null
              ? t({ id: 'guide.plan.noCost', message: 'No change to what each pays' })
              : t({ id: 'guide.plan.cost', message: `${cost} each` })}
          </Text>
          <TextLink
            label={t({ id: 'guide.plan.review', message: 'Review' })}
            onPress={onReview}
            testID="guide-plan-review"
          />
        </Row>
        {outcome === 'open' ? (
          canPropose ? (
            <SplitCtaRow
              primary={
                <PillButton
                  label={t({ id: 'guide.plan.propose', message: 'Propose to group' })}
                  onPress={onPropose}
                  disabled={busy}
                  block
                  testID="guide-plan-propose"
                />
              }
              secondary={
                <PillButton
                  variant="secondary"
                  label={t({ id: 'guide.plan.justMe', message: 'Just me' })}
                  onPress={onJustMe}
                  disabled={busy}
                  testID="guide-plan-just-me"
                />
              }
            />
          ) : (
            <PillButton
              label={t({ id: 'guide.plan.justMe', message: 'Just me' })}
              onPress={onJustMe}
              disabled={busy}
              block
              testID="guide-plan-just-me"
            />
          )
        ) : (
          <Text variant="label" testID="guide-plan-outcome">
            {outcome === 'sent'
              ? t({ id: 'guide.plan.sent', message: 'Sent to the crew chat as a vote' })
              : outcome === 'applied'
                ? t({ id: 'guide.plan.applied', message: 'In the plan' })
                : t({ id: 'guide.plan.closed', message: 'This change is no longer open' })}
          </Text>
        )}
      </Stack>
    </View>
  );
}
