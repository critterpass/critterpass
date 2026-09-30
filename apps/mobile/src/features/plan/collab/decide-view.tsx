/**
 * The live decision (3g-2): "← DAY 5 · FRI OCT 16", "● MAYA, ALEX HERE" blinking, the question,
 * the options side by side (stacked past two), where the vote stands (a tie, closing soon, or the
 * pick with APPLY TO THE PLAN for an organiser), then the anchored thread and the composer.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { format, upper } from '@cp/i18n';

import { useLoop } from '@/motion/use-loop';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PlanMember } from '../day/use-trip-plan';
import type { Decision } from './decision-model';
import { OptionCard } from './option-card';

export interface DecideViewProps {
  readonly eyebrow: string;
  readonly here: readonly string[];
  readonly decision: Decision | null;
  readonly members: readonly PlanMember[];
  readonly browsing: ReadonlyMap<string, readonly PlanMember[]>;
  readonly voteTokens: ReadonlyMap<string, number>;
  readonly onVote: (optionId: string) => void;
  /** The organiser can put the pick on the plan once the vote closes. */
  readonly onApply: (() => void) | null;
  readonly thread: ReactNode;
  readonly composer: ReactNode;
  readonly onBack?: () => void;
}

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.size.gutter,
    paddingBottom: th.space['24'],
    gap: th.space['16'],
  },
  dot: {
    width: th.space['8'],
    height: th.space['8'],
    borderRadius: th.space['4'],
    backgroundColor: th.color.pink,
  },
}));

function HereLabel({ names }: { readonly names: readonly string[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const blink = useLoop('blink');
  if (names.length === 0) return null;
  return (
    <Row gap="6" align="center" testID="plan-decide-here">
      <Animated.View style={[styles.dot, blink]} />
      <Text variant="label" color={theme.color.pink}>
        {upper(
          t({ id: 'plan.collab.here', message: `${format.list(locale, names)} here` }),
          locale,
        )}
      </Text>
    </Row>
  );
}

export function DecideView(props: DecideViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { decision } = props;
  const winner = decision?.options.find((option) => option.id === decision.winnerId) ?? null;
  const status =
    decision === null
      ? null
      : decision.phase === 'closed'
        ? winner === null
          ? t({ id: 'plan.collab.closedNoPick', message: 'Vote closed without a pick' })
          : t({ id: 'plan.collab.closedPick', message: `Picked: ${winner.title}` })
        : decision.tie
          ? t({ id: 'plan.collab.tie', message: 'It’s a tie. One more vote settles it.' })
          : decision.phase === 'closing'
            ? t({ id: 'plan.collab.closing', message: 'Closing soon. Get your vote in.' })
            : null;
  const stacked = (decision?.options.length ?? 0) > 2;
  return (
    <Scaffold variant="dark" testID="plan-decide">
      <KeyboardScrollView contentContainerStyle={styles.content}>
        <Row justify="space-between" align="center" style={{ paddingTop: theme.space['8'] }}>
          <BackEyebrow
            label={props.eyebrow}
            {...(props.onBack === undefined ? {} : { onPress: props.onBack })}
          />
          <HereLabel names={props.here} />
        </Row>
        {decision === null ? (
          <Skeleton
            preset="card"
            repeat={2}
            label={t({ id: 'plan.collab.loading', message: 'Loading the vote' })}
          />
        ) : (
          <>
            <Text variant="h1" accessibilityRole="header" numberOfLines={3}>
              {upper(decision.question, locale)}
            </Text>
            {stacked ? null : (
              <Row gap="10" align="stretch">
                {decision.options.map((option) => (
                  <OptionCard
                    key={option.id}
                    option={option}
                    members={props.members}
                    leading={decision.leaderId === option.id && decision.phase !== 'closed'}
                    winner={decision.winnerId === option.id}
                    browsing={props.browsing.get(option.id) ?? []}
                    voteToken={props.voteTokens.get(option.id) ?? 0}
                    disabled={decision.phase === 'closed'}
                    onVote={() => props.onVote(option.id)}
                  />
                ))}
              </Row>
            )}
            {stacked ? (
              <Stack gap="10">
                {decision.options.map((option) => (
                  <OptionCard
                    key={option.id}
                    option={option}
                    members={props.members}
                    leading={decision.leaderId === option.id && decision.phase !== 'closed'}
                    winner={decision.winnerId === option.id}
                    browsing={props.browsing.get(option.id) ?? []}
                    voteToken={props.voteTokens.get(option.id) ?? 0}
                    disabled={decision.phase === 'closed'}
                    onVote={() => props.onVote(option.id)}
                  />
                ))}
              </Stack>
            ) : null}
            {status === null ? null : (
              <View>
                <InfoPill testID="plan-decide-status">{status}</InfoPill>
              </View>
            )}
            {props.onApply === null ? null : (
              <PillButton
                label={t({ id: 'plan.collab.apply', message: 'Put it on the plan' })}
                onPress={props.onApply}
                testID="plan-decide-apply"
              />
            )}
            {props.thread}
          </>
        )}
      </KeyboardScrollView>
      {props.composer}
    </Scaffold>
  );
}
