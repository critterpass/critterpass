/**
 * What came of the last attempt at a phrase: what the phone heard, the verdict or the guide's one
 * tip, and each way an attempt stops short (no microphone, nothing heard, offline, a check that
 * did not come back) on its own line.
 */
import { useLingui } from '@lingui/react/macro';

import { upper } from '@cp/i18n';

import { Stack, Text, useTheme } from '@/ui';
import { PermissionCard } from '@/ui/states/PermissionCard';

import type { PracticeIssue, PracticeState } from './practice-model';

function useIssueLine(issue: PracticeIssue | null, guideName: string): string | null {
  const { t } = useLingui();
  switch (issue) {
    case null:
    case 'mic_denied':
      return null;
    case 'no_speech_module':
      return t({
        id: 'guide.practice.noModule',
        message: 'This version of the app can\'t listen. Say it, then tap "I said it".',
      });
    case 'heard_nothing':
      return t({
        id: 'guide.practice.heardNothing',
        message: "I didn't catch that. Say it once more, a little closer to the phone.",
      });
    case 'listen_failed':
      return t({
        id: 'guide.practice.listenFailed',
        message: "Listening didn't start. Try again.",
      });
    case 'offline':
      return t({
        id: 'guide.practice.offline',
        message: `${guideName} can't check how it sounds offline. Say it, then tap "I said it".`,
      });
    case 'check_failed':
      return t({
        id: 'guide.practice.checkFailed',
        message: "That one couldn't be checked, so it wasn't counted. Try again.",
      });
  }
}

export interface PracticeFeedbackProps {
  readonly guideName: string;
  /** BCP 47 language of the phrase, for what was heard. */
  readonly language: string;
  readonly state: PracticeState;
  readonly onSaid: () => void;
  readonly onOpenSettings?: () => void;
}

export function PracticeFeedback({
  guideName,
  language,
  state,
  onSaid,
  onOpenSettings,
}: PracticeFeedbackProps) {
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const issue = useIssueLine(state.issue, guideName);
  return (
    <Stack gap="16">
      {state.phase === 'listening' || state.heard !== '' ? (
        <Stack gap="2">
          <Text variant="eyebrow">
            {upper(
              state.phase === 'listening'
                ? t({ id: 'guide.practice.listening', message: 'Listening' })
                : t({ id: 'guide.practice.heard', message: 'I heard' }),
              i18n.locale,
            )}
          </Text>
          {state.heard === '' ? null : (
            <Text
              variant="inputOtp"
              accessibilityLanguage={language}
              accessibilityLiveRegion="polite"
              testID="guide-practice-heard"
            >
              {`"${state.heard}"`}
            </Text>
          )}
        </Stack>
      ) : null}
      {state.phase === 'checking' ? (
        <Text variant="bodyLg" testID="guide-practice-checking">
          {t({ id: 'guide.practice.checking', message: 'Checking…' })}
        </Text>
      ) : null}
      {state.phase === 'ok' ? (
        <Text
          variant="voice"
          color={theme.color.yellow}
          accessibilityLiveRegion="polite"
          testID="guide-practice-ok"
        >
          {state.heard === ''
            ? t({ id: 'guide.practice.okSaid', message: 'Counted. On to the next one.' })
            : t({
                id: 'guide.practice.ok',
                message: 'That came through clearly. On to the next one.',
              })}
        </Text>
      ) : null}
      {state.phase === 'retry' ? (
        <Text
          variant="voice"
          color={theme.color.yellow}
          accessibilityLiveRegion="polite"
          testID="guide-practice-tip"
        >
          {state.tip ??
            t({
              id: 'guide.practice.retry',
              message: 'Not quite yet. Play it again and have another go.',
            })}
        </Text>
      ) : null}
      {issue === null ? null : (
        <Text variant="bodyLg" testID={`guide-practice-issue-${state.issue}`}>
          {issue}
        </Text>
      )}
      {state.issue === 'mic_denied' ? (
        <PermissionCard
          title={t({ id: 'guide.voice.micDeniedTitle', message: 'The microphone is off' })}
          body={t({
            id: 'guide.practice.micDeniedBody',
            message: `${guideName} can't hear you without the microphone. Turn it on in Settings, or say it and tap "I said it".`,
          })}
          fallback={{
            label: t({ id: 'guide.practice.said', message: 'I said it' }),
            onPress: onSaid,
          }}
          {...(onOpenSettings ? { onOpenSettings: onOpenSettings } : {})}
          testID="guide-practice-mic-denied"
        />
      ) : null}
    </Stack>
  );
}
