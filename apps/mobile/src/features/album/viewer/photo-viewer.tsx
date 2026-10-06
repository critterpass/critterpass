/* eslint-disable lingui/no-unlocalized-strings -- wire values, formats and ids, never copy. */
/**
 * One album photo full screen (undesigned; built from the album's parts): a pager across the
 * photos in view, pinch to zoom, who took it, when, and the day, then the actions: pick or unpick,
 * "I'm in this", save to Photos (add-only), share, report, and delete for the uploader or an
 * organiser.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { FlatList, Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { CloseButton } from '@/ui/sheet/CloseButton';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import { useAlbumReadUrl } from '../grid/album-media';

export interface PhotoViewerProps {
  readonly photos: readonly AlbumPhoto[];
  readonly startId: string;
  readonly me: string | null;
  readonly organiser: boolean;
  readonly nameOf: (uid: string) => string;
  readonly isMeIn: (photoId: string) => boolean;
  readonly busy: 'save' | 'share' | null;
  readonly onClose: () => void;
  readonly onPick: (photo: AlbumPhoto, picked: boolean) => void;
  readonly onMeIn: (photo: AlbumPhoto, on: boolean) => void;
  readonly onSave: (photo: AlbumPhoto) => void;
  readonly onShare: (photo: AlbumPhoto) => void;
  readonly onReport: (photo: AlbumPhoto) => void;
  readonly onDelete: (photo: AlbumPhoto) => void;
}

function Page({ photo, width, height }: { photo: AlbumPhoto; width: number; height: number }) {
  const url = useAlbumReadUrl(photo.displayKey ?? photo.thumbKey);
  const { t } = useLingui();
  const theme = useTheme();
  return (
    <ScrollView
      style={{ width, height, backgroundColor: theme.semantic.bg.raised }}
      maximumZoomScale={3}
      minimumZoomScale={1}
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {url === null ? null : (
        <Image
          source={{ uri: url }}
          resizeMode="contain"
          style={{ width, height }}
          accessibilityLabel={t({ id: 'album.viewer.photo', message: 'Photo' })}
        />
      )}
    </ScrollView>
  );
}

export function PhotoViewer(props: PhotoViewerProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const start = Math.max(
    0,
    props.photos.findIndex((photo) => photo.id === props.startId),
  );
  const [index, setIndex] = useState(start);
  const photo = props.photos[index];
  const when = photo?.takenAt ?? photo?.createdAt ?? null;
  const uploader = photo === undefined ? '' : props.nameOf(photo.uploaderId);
  const time =
    when === null
      ? ''
      : format.date(locale, new Date(when), {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        });

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.semantic.bg.base }]}
      testID="album-viewer"
    >
      <FlatList
        data={props.photos}
        horizontal
        pagingEnabled
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))
        }
        renderItem={({ item }) => <Page photo={item} width={width} height={height} />}
      />
      <CloseButton
        onPress={props.onClose}
        style={{ position: 'absolute', top: insets.top + theme.space['8'], end: theme.space['16'] }}
        testID="album-viewer-close"
      />
      {photo === undefined ? null : (
        <Stack
          gap="10"
          padding="16"
          style={{
            position: 'absolute',
            start: 0,
            end: 0,
            bottom: insets.bottom,
            backgroundColor: theme.color.scrim.hex,
          }}
        >
          <Text variant="body">
            {when === null
              ? uploader
              : t({
                  id: 'album.viewer.byline',
                  message: `${uploader} · ${time}`,
                })}
          </Text>
          <Row gap="8" wrap>
            <PillButton
              label={
                photo.isPick
                  ? t({ id: 'album.viewer.picked', message: '★ Picked' })
                  : t({ id: 'album.viewer.pick', message: '☆ Pick' })
              }
              onPress={() => props.onPick(photo, !photo.isPick)}
              size="sm"
              tone={photo.isPick ? 'yellow' : 'cream'}
              testID="album-viewer-pick"
            />
            <PillButton
              label={
                props.isMeIn(photo.id)
                  ? t({ id: 'album.viewer.meIn', message: "✓ I'm in this" })
                  : t({ id: 'album.viewer.meOut', message: "I'm in this" })
              }
              onPress={() => props.onMeIn(photo, !props.isMeIn(photo.id))}
              size="sm"
              variant="secondary"
              testID="album-viewer-me"
            />
            <PillButton
              label={t({ id: 'album.viewer.save', message: 'Save' })}
              onPress={() => props.onSave(photo)}
              loading={props.busy === 'save'}
              size="sm"
              variant="secondary"
              testID="album-viewer-save"
            />
            <PillButton
              label={t({ id: 'album.viewer.share', message: 'Share' })}
              onPress={() => props.onShare(photo)}
              loading={props.busy === 'share'}
              size="sm"
              variant="secondary"
              testID="album-viewer-share"
            />
            {photo.uploaderId === props.me || props.organiser ? (
              <PillButton
                label={t({ id: 'album.viewer.delete', message: 'Delete' })}
                onPress={() => props.onDelete(photo)}
                size="sm"
                variant="destructive"
                testID="album-viewer-delete"
              />
            ) : (
              <PillButton
                label={t({ id: 'album.viewer.report', message: 'Report' })}
                onPress={() => props.onReport(photo)}
                size="sm"
                variant="tertiary"
                testID="album-viewer-report"
              />
            )}
          </Row>
        </Stack>
      )}
    </View>
  );
}
