/**
 * A live decision on the plan in the premium look (undesigned; a pushed page built from the kit):
 * the day as the title with who is here under it, the question, one card per option (tap to
 * vote), where the vote stands, "Put it on the plan" for an organiser once it is picked, and the
 * focused option's thread with its own composer. The page keeps the focused field above the
 * keyboard.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, LoadingCritter, StatusTag, Text, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll, PushScreen } from '@/ui/premium/shell';

import type { DecideViewProps } from '../../collab/decide-props';
import { PremiumOptionRow } from './option-row';

export function PremiumDecideView(props: DecideViewProps) {
  const { decision } = props;
  const { t } = useLingui();
  const locale = useLocale();
  const theme = usePremiumTheme();
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
  const here =
    props.here.length === 0
      ? undefined
      : t({
          id: 'plan.collab.here',
          message: `${format.list(locale, props.here, { type: 'unit' })} here`,
        });
  return (
    <PushScreen
      title={props.eyebrow}
      {...(here === undefined ? {} : { subtitle: here })}
      backLabel={t({ id: 'plan.premium.map.back', message: 'Back' })}
      scroll={false}
      testID="plan-decide"
    >
      <KeyboardAwareScroll
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingHorizontal: theme.space.gutter }]}
      >
        {decision === null ? (
          <LoadingCritter label={t({ id: 'plan.collab.loading', message: 'Loading the vote' })} />
        ) : (
          <>
            <Text variant="title" accessibilityRole="header" numberOfLines={3}>
              {decision.question}
            </Text>
            <View style={styles.options}>
              {decision.options.map((option) => (
                <PremiumOptionRow
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
            </View>
            {status === null ? null : (
              <View style={styles.start}>
                <StatusTag
                  label={status}
                  tone={decision.phase === 'closed' ? 'booked' : 'maybe'}
                  testID="plan-decide-status"
                />
              </View>
            )}
            {props.onApply === null ? null : (
              <Button
                label={t({ id: 'plan.collab.apply', message: 'Put it on the plan' })}
                onPress={props.onApply}
                testID="plan-decide-apply"
              />
            )}
            {props.thread}
          </>
        )}
      </KeyboardAwareScroll>
      {props.composer}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 8, paddingBottom: 32 },
  options: { gap: 10 },
  start: { alignSelf: 'flex-start' },
});
