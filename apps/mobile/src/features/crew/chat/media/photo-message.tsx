/**
 * A photo message: the worker's thumbnail (the original until the thumbnail exists) at the photo's
 * own aspect ratio, several photos in a two-column grid, the caption under them; tapping opens the
 * full view.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Image, useWindowDimensions, View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatCardProps } from '../cards/registry';
import { useChatMedia } from './media-services';
import { MediaViewer } from './media-viewer';
import { useReadUrl } from './read-urls';

/**
 * The photos' share of the screen, narrower than the card slot they sit in (to the side of the
 * sender); the tiles take point widths, as an image has no size of its own until it loads.
 */
const PHOTO_SHARE = 0.72;
const GRID_GAP = 4;

const useStyles = makeStyles((th) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: { borderRadius: th.radius.lg, overflow: 'hidden', backgroundColor: th.semantic.bg.raised },
}));

function Tile({
  mediaKey,
  thumbKey,
  ratio,
  width,
  onOpen,
}: {
  readonly mediaKey: string;
  readonly thumbKey: string | null;
  readonly ratio: number;
  readonly width: number;
  readonly onOpen: () => void;
}) {
  const styles = useStyles();
  const media = useChatMedia();
  const url = useReadUrl(media?.http ?? null, thumbKey ?? mediaKey);
  return (
    <PressScale
      accessibilityLabel={t({ id: 'chat.photo.open', message: 'Open photo' })}
      onPress={onOpen}
      style={[styles.tile, { width, aspectRatio: ratio }]}
    >
      {url === null ? null : (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
      )}
    </PressScale>
  );
}

export function PhotoMessage({ message, mine }: ChatCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const photos = message.attachments.filter((attachment) => attachment.kind === 'photo');
  const single = photos.length === 1;
  const gridWidth = Math.round(useWindowDimensions().width * PHOTO_SHARE);
  const tileWidth = single ? gridWidth : Math.floor((gridWidth - GRID_GAP) / 2);
  return (
    <Stack
      gap="6"
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
      testID={`chat-photo-${message.id}`}
    >
      <View style={[styles.grid, { width: gridWidth }]}>
        {photos.map((photo) => (
          <Tile
            key={photo.media_key}
            mediaKey={photo.media_key}
            thumbKey={photo.derived_key ?? null}
            ratio={single && photo.w && photo.h ? photo.w / photo.h : 1}
            width={tileWidth}
            onOpen={() => setOpen(photo.media_key)}
          />
        ))}
      </View>
      {message.body === '' ? null : (
        <Text variant="body" color={theme.semantic.text.primary}>
          {message.body}
        </Text>
      )}
      {open === null ? null : <MediaViewer mediaKey={open} onClose={() => setOpen(null)} />}
    </Stack>
  );
}

export function photoLabel(count: number, caption: string): string {
  const photos =
    count === 1
      ? t({ id: 'chat.photo.one', message: 'Photo' })
      : t({ id: 'chat.photo.many', message: `${count} photos` });
  return caption === '' ? photos : `${photos}: ${caption}`;
}
