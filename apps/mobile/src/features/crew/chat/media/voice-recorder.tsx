/**
 * Voice notes from the composer's mic: hold to talk and release to send, or tap to record hands-
 * free (locked) and send or cancel from the bar. While recording, the bar shows a red dot, the
 * time and the live level; sliding the bar away (or ✕) cancels. Recording stops and sends itself
 * at two minutes. A denied microphone shows the way to Settings instead.
 */
import { VOICE_NOTE_MAX_MS } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { PermissionCard } from '@/ui/states/PermissionCard';
import { Row, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { Recording, VoiceRecorderPort } from './media-services';

export const CANCEL_SLIDE_PT = 80;
const SAMPLE_MS = 100;
const PEAKS = 48;

export type RecorderState = 'idle' | 'holding' | 'locked' | 'denied';

export interface FinishedNote extends Recording {
  readonly peaks: readonly number[];
}

/** `levels` sampled while recording, reduced to `count` peaks (max per bucket). */
export function peaksOf(levels: readonly number[], count = PEAKS): number[] {
  if (levels.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index / count) * levels.length);
    const to = Math.max(from + 1, Math.floor(((index + 1) / count) * levels.length));
    return Math.round(Math.max(...levels.slice(from, to)) * 100) / 100;
  });
}

export function useVoiceRecorder(
  recorder: VoiceRecorderPort | null,
  onFinished: (note: FinishedNote) => void,
) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const levels = useRef<number[]>([]);
  const started = useRef(0);

  const finish = useCallback(async () => {
    if (recorder === null) return;
    setState('idle');
    levels.current.push(recorder.level());
    const recording = await recorder.stop();
    if (recording !== null && recording.durationMs > 0) {
      onFinished({ ...recording, peaks: peaksOf(levels.current) });
    }
  }, [recorder, onFinished]);

  const begin = useCallback(
    async (mode: 'holding' | 'locked') => {
      if (recorder === null) return;
      const outcome = await recorder.start();
      if (outcome === 'denied') {
        setState('denied');
        return;
      }
      levels.current = [];
      started.current = Date.now();
      setElapsed(0);
      setState(mode);
    },
    [recorder],
  );

  const cancel = useCallback(async () => {
    setState('idle');
    await recorder?.cancel();
  }, [recorder]);

  useEffect(() => {
    if (state !== 'holding' && state !== 'locked') return undefined;
    const timer = setInterval(() => {
      levels.current.push(recorder?.level() ?? 0);
      const at = Date.now() - started.current;
      setElapsed(at);
      if (at >= VOICE_NOTE_MAX_MS) void finish();
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [state, recorder, finish]);

  return {
    state,
    elapsed,
    onHoldStart: () => void begin('holding'),
    onHoldEnd: () => {
      if (state === 'holding') void finish();
    },
    onMicTap: () => {
      if (state === 'locked') void finish();
      else if (state === 'idle' || state === 'denied') void begin('locked');
    },
    send: () => void finish(),
    cancel: () => void cancel(),
    dismissDenied: () => setState('idle'),
  };
}

const useStyles = makeStyles((th) => ({
  bar: {
    alignItems: 'center',
    gap: th.space['10'],
    marginHorizontal: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  hint: { flex: 1 },
}));

export function VoiceRecorderBar({
  state,
  elapsed,
  onSend,
  onCancel,
  onOpenSettings,
  onDismissDenied,
}: {
  readonly state: RecorderState;
  readonly elapsed: number;
  readonly onSend: () => void;
  readonly onCancel: () => void;
  readonly onOpenSettings: () => void;
  readonly onDismissDenied: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const direction = I18nManager.isRTL ? 1 : -1;
  const slide = Gesture.Pan()
    .enabled(state === 'locked')
    .onEnd((event) => {
      'worklet';
      if (event.translationX * direction >= CANCEL_SLIDE_PT) scheduleOnRN(onCancel);
    })
    .withTestId('chat-voice-slide-cancel');

  if (state === 'denied') {
    return (
      <View style={{ marginHorizontal: theme.space['12'] }}>
        <PermissionCard
          title={t({ id: 'chat.voice.deniedTitle', message: 'The microphone is off' })}
          body={t({
            id: 'chat.voice.deniedBody',
            message: 'Turn it on in Settings to send voice notes.',
          })}
          fallback={{
            label: t({ id: 'chat.voice.typeInstead', message: 'Type instead' }),
            onPress: onDismissDenied,
          }}
          onOpenSettings={onOpenSettings}
          testID="chat-voice-denied"
        />
      </View>
    );
  }
  if (state === 'idle') return null;
  const seconds = Math.floor(elapsed / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <GestureDetector gesture={slide}>
      <Row style={styles.bar} accessibilityLiveRegion="polite" testID="chat-recorder">
        <View style={[styles.dot, { backgroundColor: theme.semantic.state.urgent }]} />
        <Text variant="monoData">{time}</Text>
        <Text variant="caption" color={theme.semantic.text.secondary} style={styles.hint}>
          {state === 'holding'
            ? t({ id: 'chat.voice.releaseToSend', message: 'Release to send' })
            : t({ id: 'chat.voice.slideToCancel', message: 'Slide to cancel' })}
        </Text>
        {state === 'locked' ? (
          <>
            <InlineAction
              kind="ghost"
              label={t({ id: 'chat.voice.cancel', message: 'Cancel' })}
              onPress={onCancel}
            />
            <InlineAction label={t({ id: 'chat.voice.send', message: 'Send' })} onPress={onSend} />
          </>
        ) : null}
      </Row>
    </GestureDetector>
  );
}
