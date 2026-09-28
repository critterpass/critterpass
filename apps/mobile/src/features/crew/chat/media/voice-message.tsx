/**
 * A voice-note message: play and pause, the waveform (peaks from the worker, drawn as bars that
 * fill as it plays), the time left, and a 1× / 1.5× speed toggle. It plays the worker's normalised
 * AAC, or the recording itself until that exists.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Row, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatCardProps } from '../cards/registry';
import { useChatMedia, type PlayerPort } from './media-services';
import { readUrl } from './read-urls';

export const WAVEFORM_BARS = 32;
const TICK_MS = 250;

/** `peaks` resampled to `bars` bars (a flat line when there are none yet). */
export function bars(peaks: readonly number[] | undefined, count = WAVEFORM_BARS): number[] {
  if (peaks === undefined || peaks.length === 0) return Array.from({ length: count }, () => 0.15);
  return Array.from({ length: count }, (_, index) => {
    const peak = peaks[Math.floor((index / count) * peaks.length)] ?? 0;
    return Math.max(0.1, peak);
  });
}

export function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const useStyles = makeStyles((th) => ({
  bubble: {
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['10'],
    borderRadius: th.radius.lg,
    minWidth: 220,
  },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, flex: 1 },
  bar: { width: 3, borderRadius: 2 },
}));

/** Play triangle or pause bars, drawn from views (no glyph font dependency). */
function PlayGlyph({ playing, color }: { readonly playing: boolean; readonly color: string }) {
  if (playing) {
    return (
      <Row gap="4">
        <View style={{ width: 4, height: 14, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 4, height: 14, backgroundColor: color, borderRadius: 1 }} />
      </Row>
    );
  }
  return (
    <View
      style={{
        marginLeft: 3,
        width: 0,
        height: 0,
        borderTopWidth: 8,
        borderBottomWidth: 8,
        borderLeftWidth: 13,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

export function VoiceMessage({ message, mine }: ChatCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const media = useChatMedia();
  const voice = message.attachments.find((attachment) => attachment.kind === 'voice');
  const player = useRef<PlayerPort | null>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(0);
  const [rate, setRate] = useState<1 | 1.5>(1);
  const durationMs = voice?.duration_ms ?? 0;

  useEffect(() => () => player.current?.release(), []);
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      const current = player.current;
      if (current === null) return;
      const { current: at, duration } = current.position();
      setPlayed(at * 1000);
      if (!current.playing() && duration > 0 && at >= duration - 0.05) {
        setPlaying(false);
        setPlayed(0);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const toggle = async () => {
    if (media === null || voice === undefined) return;
    if (playing) {
      player.current?.pause();
      setPlaying(false);
      return;
    }
    if (player.current === null) {
      const url = await readUrl(media.http, voice.derived_key ?? voice.media_key);
      if (url === null) return;
      player.current = media.createPlayer(url);
      player.current.setRate(rate);
    }
    player.current.play();
    setPlaying(true);
  };

  const ink = mine ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const fill = durationMs > 0 ? played / durationMs : 0;
  const shape = bars(voice?.peaks);
  return (
    <Row
      style={[
        styles.bubble,
        { backgroundColor: mine ? theme.semantic.action.primary : theme.semantic.bg.raised },
      ]}
      testID={`chat-voice-${message.id}`}
    >
      <PressScale
        accessibilityLabel={
          playing
            ? t({ id: 'chat.voice.pause', message: 'Pause voice note' })
            : t({ id: 'chat.voice.play', message: 'Play voice note' })
        }
        onPress={() => void toggle()}
        style={[
          styles.play,
          { backgroundColor: mine ? theme.semantic.bg.base : theme.semantic.action.primary },
        ]}
        testID={`chat-voice-play-${message.id}`}
      >
        <PlayGlyph
          playing={playing}
          color={mine ? theme.semantic.text.primary : theme.semantic.text.onAccent}
        />
      </PressScale>
      <View style={styles.wave} importantForAccessibility="no-hide-descendants">
        {shape.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${Math.round(height * 100)}%`,
                backgroundColor: ink,
                opacity: index / shape.length < fill ? 1 : 0.4,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" color={ink}>
        {clock(playing || played > 0 ? durationMs - played : durationMs)}
      </Text>
      <PressScale
        accessibilityLabel={t({ id: 'chat.voice.speed', message: `Playback speed ${rate}×` })}
        onPress={() => {
          const next = rate === 1 ? 1.5 : 1;
          setRate(next);
          player.current?.setRate(next);
        }}
        testID={`chat-voice-speed-${message.id}`}
      >
        <Text variant="label" color={ink}>
          {rate === 1
            ? t({ id: 'chat.voice.rate1', message: '1×' })
            : t({ id: 'chat.voice.rate15', message: '1.5×' })}
        </Text>
      </PressScale>
    </Row>
  );
}

export function voiceLabel(durationMs: number): string {
  const length = clock(durationMs);
  return t({ id: 'chat.voice.label', message: `Voice note, ${length}` });
}
