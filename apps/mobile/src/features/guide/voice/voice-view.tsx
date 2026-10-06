/**
 * Voice mode (3j-2): who is answering and what it is doing now along the top, the guide's sticker
 * in breathing rings over a waveform from the microphone, then what was heard and the reply as
 * text alongside the audio, with the changes the guide offers as cards. The footer sends those to
 * the group and holds the microphone, the one control that talks, sends and interrupts. Each way
 * a turn can stop short (no microphone, nothing heard, offline, the day's questions spent, a reply
 * that failed) has its own line where the reply would be.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { Row, Scaffold, Stack, Text, makeStyles, useTheme } from '@/ui';
import { TextLink } from '@/ui/buttons/TextLink';
import { PermissionCard } from '@/ui/states/PermissionCard';

import { VoiceFooter, type VoiceGroupSend } from './voice-footer';
import { VoiceStage } from './voice-stage';
import { VoiceSwapCard, type VoiceSwap } from './voice-swap-card';
import type { VoiceIssue, VoiceState } from './voice-turn';

export interface VoiceViewProps {
  readonly guideName: string;
  /** The crew sees this conversation (group mode); otherwise it is the asker's own. */
  readonly shared: boolean;
  readonly sticker: ReactNode;
  readonly state: VoiceState;
  readonly level: SharedValue<number>;
  /** The changes the guide offered in this turn. */
  readonly swaps: readonly VoiceSwap[];
  /** What each share moves by for change sets with several changes ("+$22"). */
  readonly costs: readonly string[];
  /** Null when there is nothing to send to the group. */
  readonly group: VoiceGroupSend | null;
  readonly onTalk: () => void;
  readonly onSend: () => void;
  readonly onInterrupt: () => void;
  /** Back to the guide sheet, to type instead. */
  readonly onType: () => void;
  readonly onOpenSettings?: () => void;
}

const useStyles = makeStyles((t) => ({
  body: {
    flexGrow: 1,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    paddingBottom: t.space['24'],
    gap: t.space['24'],
  },
  stage: { paddingTop: t.space['32'] },
  dot: {
    width: t.space['8'],
    height: t.space['8'],
    borderRadius: t.space['4'],
    backgroundColor: t.color.pink,
  },
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
  const status = {
    idle: t({ id: 'guide.voice.state.idle', message: 'Tap to talk' }),
    listening: t({ id: 'guide.voice.state.listening', message: 'Listening' }),
    thinking: t({ id: 'guide.voice.state.thinking', message: 'Thinking' }),
    speaking: t({ id: 'guide.voice.state.speaking', message: 'Answering' }),
  }[state.phase];
  const mic = {
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
  const cannotTalk = state.issue === 'mic_denied' || state.issue === 'no_speech_module';
  const readOnly =
    state.reply !== '' && !state.spoken && state.phase === 'idle' && state.issue === null;
  const who = `${props.guideName} · ${
    props.shared
      ? t({ id: 'guide.voice.groupMode', message: 'Group mode' })
      : t({ id: 'guide.voice.justMe', message: 'Just me' })
  }`;

  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-voice">
      <ScrollView contentContainerStyle={styles.body}>
        <Row gap="12" align="center" justify="space-between">
          <Text variant="eyebrow">{upper(who, i18n.locale)}</Text>
          <Row gap="6" align="center" testID={`guide-voice-status-${state.phase}`}>
            <View style={styles.dot} />
            <Text
              variant="label"
              color={theme.color.pink}
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
            >
              {status}
            </Text>
          </Row>
        </Row>
        <View style={styles.stage}>
          <VoiceStage
            sticker={props.sticker}
            level={props.level}
            listening={state.phase === 'listening'}
          />
        </View>
        <Stack gap="12">
          {state.heard === '' ? null : (
            <Text variant="inputOtp" accessibilityLiveRegion="polite" testID="guide-voice-heard">
              {`"${state.heard}"`}
            </Text>
          )}
          {state.reply === '' ? null : (
            <Text
              variant="voice"
              color={theme.color.yellow}
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
              {t({
                id: 'guide.voice.textOnly',
                message: "This reply couldn't be spoken, so it's text only.",
              })}
            </Text>
          ) : null}
          {issue === null ? null : (
            <Text variant="bodyLg" testID={`guide-voice-issue-${state.issue}`}>
              {issue}
            </Text>
          )}
          {state.issue === 'no_speech_module' ? (
            <TextLink
              label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
              onPress={props.onType}
              testID="guide-voice-type"
            />
          ) : null}
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
        {props.swaps.length === 0 ? null : (
          <Stack gap="8">
            {props.swaps.map((swap, index) => (
              <VoiceSwapCard key={swap.id} swap={swap} index={index} />
            ))}
            {props.costs.map((cost, index) => (
              <Text key={index} variant="bodySm" color={theme.semantic.text.secondary}>
                {t({ id: 'guide.plan.cost', message: `${cost} each` })}
              </Text>
            ))}
          </Stack>
        )}
      </ScrollView>
      <VoiceFooter
        group={props.group}
        mic={
          cannotTalk
            ? null
            : {
                label: mic.label,
                onPress: mic.onPress,
                disabled: state.phase === 'thinking',
                testID: `guide-voice-${mic.id}`,
              }
        }
      />
    </Scaffold>
  );
}
