/**
 * Voice mode (3j-2): the guide's sticker in breathing rings with a waveform from the microphone,
 * what was heard, and the reply as text alongside the audio. One button talks, sends and
 * interrupts; "Mute replies" keeps the reply to text. Each way the turn can stop short (no
 * microphone, nothing heard, offline, the day's questions spent, a reply that failed) has its own
 * line and a way on.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { Scaffold, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { VoiceOrb, type VoiceOrbState } from '@/ui/camera/VoiceOrb';
import { Toggle } from '@/ui/inputs/Toggle';
import { PermissionCard } from '@/ui/states/PermissionCard';

import type { VoiceIssue, VoiceState } from './voice-turn';

export interface VoiceViewProps {
  readonly guideName: string;
  readonly modeLine: string;
  readonly sticker: ReactNode;
  readonly state: VoiceState;
  readonly level: SharedValue<number>;
  /** Speaking over the reply interrupts it; otherwise only the button does. */
  readonly interruptBySpeech: boolean;
  readonly onTalk: () => void;
  readonly onSend: () => void;
  readonly onInterrupt: () => void;
  readonly onMuted: (muted: boolean) => void;
  /** Back to the guide sheet, to type instead. */
  readonly onType: () => void;
  readonly onOpenSettings?: () => void;
}

const useStyles = makeStyles((t) => ({
  body: {
    flexGrow: 1,
    padding: t.size.gutter,
    paddingTop: t.space['32'],
    gap: t.space['24'],
    justifyContent: 'space-between',
  },
  reply: { textAlign: 'center' },
}));

function useIssueLine(issue: VoiceIssue | null, guideName: string): string | null {
  const { t } = useLingui();
  switch (issue) {
    case null:
    case 'mic_denied':
      return null;
    case 'no_speech_module':
      return t({
        id: 'guide.voice.noModule',
        message: 'Voice is not available in this version of the app. Type your question instead.',
      });
    case 'heard_nothing':
      return t({
        id: 'guide.voice.heardNothing',
        message: "I didn't catch that. Somewhere quieter helps, or hold the phone closer.",
      });
    case 'listen_failed':
      return t({
        id: 'guide.voice.listenFailed',
        message: "Listening didn't start. Try again, or type your question.",
      });
    case 'offline_queued':
      return t({
        id: 'guide.voice.offlineQueued',
        message: `You're offline. ${guideName} has your question and answers in the chat when you're back online.`,
      });
    case 'quota':
      return t({
        id: 'guide.voice.quota',
        message: `That's today's questions used up. ${guideName} is back after midnight; the chat shows your options.`,
      });
    case 'reply_failed':
      return t({
        id: 'guide.voice.replyFailed',
        message: "The answer didn't come through, and it wasn't counted. Ask again.",
      });
  }
}

export function VoiceView(props: VoiceViewProps) {
  const { state } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const issue = useIssueLine(state.issue, props.guideName);
  const orb: VoiceOrbState =
    state.phase === 'listening' ? 'listening' : state.phase === 'thinking' ? 'thinking' : 'idle';
  const stateLabel = {
    idle: t({ id: 'guide.voice.state.idle', message: 'Tap to talk' }),
    listening: t({ id: 'guide.voice.state.listening', message: 'Listening' }),
    thinking: t({ id: 'guide.voice.state.thinking', message: 'Thinking' }),
    speaking: t({ id: 'guide.voice.state.speaking', message: 'Answering' }),
  }[state.phase];
  const button = {
    idle: {
      label: t({ id: 'guide.voice.talk', message: 'Talk' }),
      onPress: props.onTalk,
      id: 'talk',
    },
    listening: {
      label: t({ id: 'guide.voice.done', message: 'Done talking' }),
      onPress: props.onSend,
      id: 'send',
    },
    thinking: {
      label: t({ id: 'guide.voice.talk', message: 'Talk' }),
      onPress: props.onTalk,
      id: 'talk',
    },
    speaking: {
      label: t({ id: 'guide.voice.interrupt', message: 'Stop and talk' }),
      onPress: props.onInterrupt,
      id: 'interrupt',
    },
  }[state.phase];
  const readOnly =
    state.reply !== '' && !state.spoken && state.phase === 'idle' && state.issue === null;

  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-voice">
      <ScrollView contentContainerStyle={styles.body}>
        <Stack gap="4" align="center">
          <Text variant="eyebrow">{upper(props.guideName, i18n.locale)}</Text>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {props.modeLine}
          </Text>
        </Stack>
        <Stack gap="16" align="center">
          <VoiceOrb
            level={props.level}
            sticker={props.sticker}
            state={orb}
            stateLabel={stateLabel}
            {...(state.heard === '' ? {} : { transcript: state.heard })}
            testID={`guide-voice-orb-${state.phase}`}
          />
          {state.reply === '' ? null : (
            <Text
              variant="voice"
              style={styles.reply}
              accessibilityLiveRegion="polite"
              testID="guide-voice-reply"
            >
              {state.reply}
            </Text>
          )}
          {readOnly ? (
            <Text
              variant="caption"
              color={theme.semantic.text.secondary}
              testID="guide-voice-text-only"
            >
              {state.muted
                ? t({
                    id: 'guide.voice.textOnlyMuted',
                    message: 'Replies are muted, so this one is text only.',
                  })
                : t({
                    id: 'guide.voice.textOnly',
                    message: "This reply couldn't be spoken, so it's text only.",
                  })}
            </Text>
          ) : null}
          {issue === null ? null : (
            <Text variant="bodySm" style={styles.reply} testID={`guide-voice-issue-${state.issue}`}>
              {issue}
            </Text>
          )}
          {state.issue === 'mic_denied' ? (
            <PermissionCard
              title={t({ id: 'guide.voice.micDeniedTitle', message: 'The microphone is off' })}
              body={t({
                id: 'guide.voice.micDeniedBody',
                message: `${props.guideName} can't hear you without the microphone. Turn it on in Settings, or type your question.`,
              })}
              fallback={{
                label: t({ id: 'guide.voice.typeInstead', message: 'Type instead' }),
                onPress: props.onType,
              }}
              {...(props.onOpenSettings ? { onOpenSettings: props.onOpenSettings } : {})}
              testID="guide-voice-mic-denied"
            />
          ) : null}
        </Stack>
        <Stack gap="16">
          {state.issue === 'mic_denied' || state.issue === 'no_speech_module' ? null : (
            <PillButton
              block
              label={button.label}
              onPress={button.onPress}
              disabled={state.phase === 'thinking'}
              testID={`guide-voice-${button.id}`}
            />
          )}
          {state.phase === 'speaking' && props.interruptBySpeech ? (
            <Text variant="caption" color={theme.semantic.text.secondary} style={styles.reply}>
              {t({ id: 'guide.voice.bargeHint', message: 'Or just start talking.' })}
            </Text>
          ) : null}
          <Toggle
            value={state.muted}
            onValueChange={props.onMuted}
            label={t({ id: 'guide.voice.mute', message: 'Mute replies' })}
            testID="guide-voice-mute"
          />
          <TextLink
            label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
            onPress={props.onType}
            testID="guide-voice-type"
          />
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
