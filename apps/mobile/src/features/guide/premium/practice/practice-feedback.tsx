/**
 * What came of the last attempt, in the premium look: what the phone heard (live while it
 * listens), "Checking…", the verdict or the guide's one tip in the guide's hand, the line for an
 * attempt that stopped short, and the microphone-off card with its two ways on.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Banner,
  Button,
  Text,
  enterTransition,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { useIssueLine } from '../../practice/practice-feedback';
import type { PracticeState } from '../../practice/practice-model';

export function PremiumPracticeFeedback(props: {
  readonly guideName: string;
  readonly language: string;
  readonly state: PracticeState;
  readonly onSaid: () => void;
  readonly onOpenSettings?: (() => void) | undefined;
}) {
  const { state, guideName } = props;
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const issue = useIssueLine(state.issue, guideName);
  const verdict =
    state.phase === 'ok'
      ? state.heard === ''
        ? t({ id: 'guide.practice.okSaid', message: 'Counted. On to the next one.' })
        : t({ id: 'guide.practice.ok', message: 'That came through clearly. On to the next one.' })
      : state.phase === 'retry'
        ? (state.tip ??
          t({
            id: 'guide.practice.retry',
            message: 'Not quite yet. Play it again and have another go.',
          }))
        : null;
  return (
    <View style={{ gap: 12 }}>
      {state.phase === 'listening' || state.heard !== '' ? (
        <View style={{ gap: 4 }}>
          <Text variant="tier" tone="muted">
            {state.phase === 'listening'
              ? t({ id: 'guide.practice.listening', message: 'Listening' })
              : t({ id: 'guide.practice.heard', message: 'I heard' })}
          </Text>
          {state.heard === '' ? null : (
            <Text
              variant="headline"
              singleLine={false}
              accessibilityLanguage={props.language}
              accessibilityLiveRegion="polite"
              testID="guide-practice-heard"
            >
              {`“${state.heard}”`}
            </Text>
          )}
        </View>
      ) : null}
      {state.phase === 'checking' ? (
        <Text variant="rowText" tone="muted" testID="guide-practice-checking">
          {t({ id: 'guide.practice.checking', message: 'Checking…' })}
        </Text>
      ) : null}
      {verdict === null ? null : (
        <Animated.View key={`${state.phase}-${verdict}`} entering={enterTransition(reduced)}>
          <Text
            variant="guide"
            singleLine={false}
            color={state.phase === 'ok' ? th.color.status.booked.text : th.color.ink}
            accessibilityLiveRegion="polite"
            testID={state.phase === 'ok' ? 'guide-practice-ok' : 'guide-practice-tip'}
          >
            {verdict}
          </Text>
        </Animated.View>
      )}
      {issue === null ? null : (
        <Text variant="rowText" singleLine={false} testID={`guide-practice-issue-${state.issue}`}>
          {issue}
        </Text>
      )}
      {state.issue === 'mic_denied' ? (
        <View style={{ gap: 10 }} testID="guide-practice-mic-denied">
          <Banner
            tone="error"
            text={t({
              id: 'guide.practice.micDeniedBody',
              message: `${guideName} can't hear you without the microphone. Turn it on in Settings, or say it and tap "I said it".`,
            })}
            {...(props.onOpenSettings === undefined
              ? {}
              : {
                  action: {
                    label: t({ id: 'chat.premium.openSettings', message: 'Open Settings' }),
                    onPress: props.onOpenSettings,
                  },
                })}
          />
          <Button
            variant="secondary"
            size="medium"
            label={t({ id: 'guide.practice.said', message: 'I said it' })}
            onPress={props.onSaid}
          />
        </View>
      ) : null}
    </View>
  );
}
