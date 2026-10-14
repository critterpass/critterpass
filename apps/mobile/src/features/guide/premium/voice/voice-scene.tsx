/**
 * Voice (5.15): the guide in a white disc inside two sun ping rings while it listens, the state
 * pill, what you said and the guide's answer in its own hand, a live waveform from the microphone
 * level, the swaps it offers on one card, then the white microphone and Send to the group. ✕
 * stops listening and goes back to typing. The microphone off, no speech module and the other
 * issues read in the guide's words.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import { Bob, Ping } from '@/features/critters';
import { FullScreen, useScreenInsets } from '@/ui/premium/shell';

import { useIssueLine } from '../../voice/voice-issue-line';
import { type VoiceViewProps } from '../../voice/voice-screen';
import { VOICE_PAINT } from '../guide-paint';
import { Bar } from './voice-wave';

const BARS = 34;

const useStyles = makePremiumStyles((th) => ({
  stage: { height: 260, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: th.accent.sun,
  },
  disc: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.float,
  },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: th.color.ink,
  },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 34, alignSelf: 'center' },
  card: { borderRadius: 24, backgroundColor: th.color.card, boxShadow: th.shadow.card },
  swap: { paddingVertical: 12, paddingRight: 16, paddingLeft: 10, gap: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  mic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
}));

export function PremiumVoiceScene(props: VoiceViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useScreenInsets();
  const { state } = props;
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
  const guide = props.guideName;
  const who = props.shared
    ? t({ id: 'guide.premium.voice.group', message: `${guide} · group mode` })
    : t({ id: 'guide.premium.voice.me', message: `${guide} · just me` });
  return (
    <FullScreen
      closeLabel={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
      overPhoto={false}
      onClose={props.onType}
      testID="guide-voice"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: th.color.ground }]}>
        <View
          style={[StyleSheet.absoluteFill, { experimental_backgroundImage: VOICE_PAINT.glow }]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 20,
          gap: 16,
          paddingBottom: 24,
        }}
      >
        <Text variant="rowTitle" align="center">
          {who}
        </Text>
        <View style={styles.stage}>
          {state.phase === 'listening' ? (
            <>
              <Ping style={styles.ring} ms={2200} />
              <Ping style={styles.ring} ms={2200} delayMs={1100} />
            </>
          ) : null}
          <View style={styles.disc}>
            <Bob>
              <CritterSticker
                kind={props.guideKind ?? 'gecko'}
                name={guide}
                size={132}
                pose="think"
              />
            </Bob>
          </View>
        </View>
        <View style={styles.pill} testID={`guide-voice-status-${state.phase}`}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: th.accent.mint }} />
          <Text variant="badge" tone="onInk" accessibilityLiveRegion="polite">
            {status}
          </Text>
        </View>
        {state.heard === '' ? null : (
          <Text variant="title" accessibilityLiveRegion="polite" testID="guide-voice-heard">
            {state.heard}
          </Text>
        )}
        {state.reply === '' ? null : (
          <Text
            variant="guide"
            color={th.color.status.maybe.text}
            accessibilityLiveRegion="polite"
            testID="guide-voice-reply"
          >
            {state.reply}
          </Text>
        )}
        {state.reply !== '' && !state.spoken && state.phase === 'idle' && state.issue === null ? (
          <Text variant="captionMuted" tone="muted" testID="guide-voice-text-only">
            {t({
              id: 'guide.voice.textOnly',
              message: 'This reply couldn’t be spoken, so it’s text only.',
            })}
          </Text>
        ) : null}
        {state.phase === 'listening' ? (
          <View style={styles.wave} accessibilityElementsHidden>
            {Array.from({ length: BARS }, (_, index) => (
              <Bar key={index} index={index} level={props.level} />
            ))}
          </View>
        ) : null}
        {issue === null ? null : (
          <Text variant="body" testID={`guide-voice-issue-${String(state.issue)}`}>
            {issue}
          </Text>
        )}
        {state.issue === 'mic_denied' ? (
          <View style={[styles.card, { padding: 16, gap: 10 }]} testID="guide-voice-mic-denied">
            <Text variant="rowTitle">
              {t({ id: 'guide.voice.micDeniedTitle', message: 'The microphone is off' })}
            </Text>
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'guide.voice.micDeniedBody',
                message: `${props.guideName} can't hear you without the microphone. Turn it on in Settings, or type your question.`,
              })}
            </Text>
            {props.onOpenSettings === undefined ? null : (
              <Button
                size="medium"
                label={t({ id: 'chat.premium.openSettings', message: 'Open Settings' })}
                onPress={props.onOpenSettings}
              />
            )}
          </View>
        ) : null}
        {cannotTalk ? (
          <TextButton
            align="center"
            label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
            onPress={props.onType}
            testID="guide-voice-type"
          />
        ) : null}
        {props.swaps.length === 0 ? null : (
          <View style={styles.card} testID="guide-voice-swaps">
            {props.swaps.map((swap, index) => (
              <View
                key={swap.id}
                style={[
                  styles.swap,
                  index === 0
                    ? null
                    : { borderTopWidth: th.size.hairline, borderTopColor: th.color.hairline },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="rowTitle" style={{ flex: 1 }}>
                    {swap.title}
                  </Text>
                  {swap.delta === null ? null : <Text variant="rowTitle">{swap.delta}</Text>}
                </View>
                <Text variant="captionMuted" tone="muted">
                  {swap.detail}
                </Text>
              </View>
            ))}
            {props.costs.map((cost) => (
              <Text key={cost} variant="captionMuted" tone="muted" style={{ padding: 12 }}>
                {t({ id: 'guide.plan.cost', message: `${cost} each` })}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        {cannotTalk ? null : (
          <PressableScale
            style={styles.mic}
            onPress={mic.onPress}
            disabled={state.phase === 'thinking'}
            accessibilityRole="button"
            accessibilityLabel={mic.label}
            testID={`guide-voice-${mic.id}`}
          >
            <Icon
              name={state.phase === 'listening' ? 'check' : 'mic'}
              size={24}
              color={th.color.ink}
            />
          </PressableScale>
        )}
        {props.group === null ? null : props.group.status === 'open' ? (
          <View style={{ flex: 1 }}>
            <Button
              label={t({ id: 'guide.voice.sendToGroup', message: 'Send to the group' })}
              onPress={props.group.onSend}
              loading={props.group.busy}
              testID="guide-voice-send-group"
            />
          </View>
        ) : (
          <Text variant="rowText" tone="muted" style={{ flex: 1 }} testID="guide-voice-group-sent">
            {t({ id: 'guide.voice.sentToGroup', message: 'Sent to the crew chat as a vote' })}
          </Text>
        )}
      </View>
    </FullScreen>
  );
}
