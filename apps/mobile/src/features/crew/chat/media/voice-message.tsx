/**
 * A voice-note message: play and pause, the waveform (peaks from the worker, drawn as bars that
 * fill as it plays), the time left, and a 1× / 1.5× speed toggle. It plays the worker's normalised
 * AAC, or the recording itself until that exists, from a local copy (./voice-playback). While the
 * note downloads the play button dims; a note that cannot be fetched says so and plays on a retry.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Row, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatCardProps } from '../cards/registry';
import { useChatMedia } from './media-services';
import { useVoicePlayback } from './voice-playback';

export const WAVEFORM_BARS = 32;

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
  // Undesigned: the play button dims while the note downloads.
  loading: { opacity: 0.5 },
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
  const { state, playedMs, durationMs, rate, toggle, cycleRate } = useVoicePlayback(
    media,
    message.id,
    voice,
  );
  const playing = state === 'playing';
  const loading = state === 'loading';
  const failed = state === 'failed';

  const ink = mine ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const fill = durationMs > 0 ? playedMs / durationMs : 0;
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
            : loading
              ? t({ id: 'chat.voice.loading', message: 'Loading voice note' })
              : t({ id: 'chat.voice.play', message: 'Play voice note' })
        }
        accessibilityState={{ busy: loading }}
        onPress={() => void toggle()}
        style={[
          styles.play,
          loading ? styles.loading : null,
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
      <Text variant="caption" color={ink} testID={`chat-voice-time-${message.id}`}>
        {failed
          ? t({ id: 'chat.voice.failed', message: 'Couldn’t load' })
          : clock(playing || playedMs > 0 ? durationMs - playedMs : durationMs)}
      </Text>
      <PressScale
        accessibilityLabel={t({ id: 'chat.voice.speed', message: `Playback speed ${rate}×` })}
        onPress={cycleRate}
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
