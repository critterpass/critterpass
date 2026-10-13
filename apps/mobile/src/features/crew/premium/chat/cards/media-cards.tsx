/**
 * The premium chat's own cards (5.11): photos (one at its shape held between 3:4 and 3:2, more in
 * a two-up grid of at most four with "+N" on the last, a caption
 * under them, tap to open the viewer), a voice note (play, its waveform filling as it plays, the
 * time left and the speed), and the card for a kind this build does not know yet.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';

import { Icon, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { ChatMessage } from '../../../chat/data/rows';
import { useChatMedia } from '../../../chat/media/media-services';
import { useReadUrl } from '../../../chat/media/read-urls';
import { useVoicePlayback } from '../../../chat/media/voice-playback';
import { bars, clock } from '../../../chat/media/voice-note';
import { PremiumPhotoViewer } from './photo-viewer';

const PHOTO_SHARE = 0.66;
const GAP = 4;
/** Photos past this many show as "+N" on the last tile; the viewer still has them all. */
export const MAX_TILES = 4;

/** A photo's shape on screen, held between portrait 3:4 and landscape 3:2. */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(1.5, Math.max(0.75, ratio));
}

const useStyles = makePremiumStyles((th) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { borderRadius: 18, overflow: 'hidden', backgroundColor: th.color.control },
  more: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.scrim,
  },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 22,
  },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
  bar: { flex: 1, borderRadius: 1 },
  unknown: {
    padding: 14,
    gap: 4,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function Tile({
  mediaKey,
  thumbKey,
  ratio,
  width,
  onOpen,
  more,
}: {
  readonly mediaKey: string;
  readonly thumbKey: string | null;
  readonly ratio: number;
  readonly width: number;
  readonly onOpen: () => void;
  /** Photos not drawn, said on this last tile. */
  readonly more?: number;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const media = useChatMedia();
  const url = useReadUrl(media?.http ?? null, thumbKey ?? mediaKey);
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="imagebutton"
      accessibilityLabel={t({ id: 'chat.photo.open', message: 'Open photo' })}
      style={[styles.tile, { width, aspectRatio: ratio }]}
    >
      {url === null ? null : <Image source={{ uri: url }} style={{ flex: 1 }} resizeMode="cover" />}
      {more === undefined || more <= 0 ? null : (
        <View style={styles.more}>
          <Text variant="title" color={th.color.onInkSurface}>{`+${more}`}</Text>
        </View>
      )}
    </PressableScale>
  );
}

export function PhotoCard({
  message,
  mine,
}: {
  readonly message: ChatMessage;
  readonly mine: boolean;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState<string | null>(null);
  const photos = message.attachments.filter((attachment) => attachment.kind === 'photo');
  const single = photos.length === 1;
  const width = Math.round(useWindowDimensions().width * PHOTO_SHARE);
  const tile = single ? width : Math.floor((width - GAP) / 2);
  const shown = photos.slice(0, MAX_TILES);
  return (
    <View
      style={{ gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}
      testID={`chat-photo-${message.id}`}
    >
      <View style={[styles.grid, { width }]}>
        {shown.map((photo, index) => (
          <Tile
            key={photo.media_key}
            mediaKey={photo.media_key}
            thumbKey={photo.derived_key ?? null}
            ratio={single && photo.w && photo.h ? clampRatio(photo.w / photo.h) : 1}
            width={tile}
            onOpen={() => setOpen(photo.media_key)}
            {...(index === shown.length - 1 ? { more: photos.length - shown.length } : {})}
          />
        ))}
      </View>
      {message.body === '' ? null : <Text variant="body">{message.body}</Text>}
      {open === null ? null : (
        <PremiumPhotoViewer
          keys={photos.map((photo) => photo.media_key)}
          openKey={open}
          caption={message.body}
          onClose={() => setOpen(null)}
        />
      )}
    </View>
  );
}

export function VoiceCard({
  message,
  mine,
}: {
  readonly message: ChatMessage;
  readonly mine: boolean;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const media = useChatMedia();
  const voice = message.attachments.find((attachment) => attachment.kind === 'voice');
  const { state, playedMs, durationMs, rate, toggle, cycleRate } = useVoicePlayback(
    media,
    message.id,
    voice,
  );
  const playing = state === 'playing';
  const ink = mine ? th.color.onInk : th.color.ink;
  const fill = durationMs > 0 ? playedMs / durationMs : 0;
  const shape = bars(voice?.peaks);
  return (
    <View
      style={[
        styles.voice,
        { backgroundColor: mine ? th.color.ink : th.color.card },
        mine ? null : { boxShadow: th.shadow.card },
      ]}
      testID={`chat-voice-${message.id}`}
    >
      <PressableScale
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={
          playing
            ? t({ id: 'chat.voice.pause', message: 'Pause voice note' })
            : state === 'loading'
              ? t({ id: 'chat.voice.loading', message: 'Loading voice note' })
              : t({ id: 'chat.voice.play', message: 'Play voice note' })
        }
        accessibilityState={{ busy: state === 'loading' }}
        style={[styles.play, { backgroundColor: mine ? th.color.card : th.color.ink }]}
        testID={`chat-voice-play-${message.id}`}
      >
        <Icon
          name={playing ? 'minus' : 'forward'}
          size={16}
          color={mine ? th.color.ink : th.color.onInk}
        />
      </PressableScale>
      <View style={styles.wave} importantForAccessibility="no-hide-descendants">
        {shape.map((height, index) => (
          <View
            key={index}
            style={[
              styles.bar,
              {
                height: `${Math.round(height * 100)}%`,
                backgroundColor: ink,
                opacity: index / shape.length < fill ? 1 : 0.35,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="badge" color={ink} testID={`chat-voice-time-${message.id}`}>
        {state === 'failed'
          ? t({ id: 'chat.voice.failed', message: 'Couldn’t load' })
          : clock(playing || playedMs > 0 ? durationMs - playedMs : durationMs)}
      </Text>
      <PressableScale
        onPress={cycleRate}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'chat.voice.speed', message: `Playback speed ${rate}×` })}
        testID={`chat-voice-speed-${message.id}`}
      >
        <Text variant="badge" color={ink}>
          {rate === 1
            ? t({ id: 'chat.voice.rate1', message: '1×' })
            : t({ id: 'chat.voice.rate15', message: '1.5×' })}
        </Text>
      </PressableScale>
    </View>
  );
}

export function UnknownCard({ message }: { readonly message: ChatMessage }) {
  const styles = useStyles();
  return (
    <View style={styles.unknown} testID={`chat-unknown-${message.id}`}>
      <Text variant="rowTitle">
        {t({ id: 'chat.card.unknown.title', message: 'This message needs a newer CritterPass' })}
      </Text>
      <Text variant="captionMuted" tone="muted">
        {t({ id: 'chat.card.unknown.line', message: 'Update the app to see it here.' })}
      </Text>
    </View>
  );
}
