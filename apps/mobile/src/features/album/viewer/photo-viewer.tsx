/* eslint-disable lingui/no-unlocalized-strings -- item kinds and ids, never copy. */
/**
 * One album photo full screen (undesigned; the app's shared viewer with the album's bar at its
 * foot): swipe across the photos in view, pinch or double-tap to zoom, drag down to put it away.
 * The bar says who took it and when, who is in it, and carries the actions in one row: pick or
 * unpick, "I'm in this", save to Photos (add-only), share, and delete (the uploader or an
 * organiser) or report. A photo that could not be loaded says so and offers another try.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Lightbox } from '@/ui/media/lightbox/Lightbox';
import { indexOfKey, type LightboxItem } from '@/ui/media/lightbox/lightbox-model';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import type { ViewerUrls } from './use-viewer-urls';

export interface PhotoViewerProps {
  readonly photos: readonly AlbumPhoto[];
  readonly startId: string;
  readonly urls: ViewerUrls;
  readonly me: string | null;
  readonly organiser: boolean;
  readonly nameOf: (uid: string) => string;
  /** The names of the travellers who said they are in the photo. */
  readonly namesIn: (photoId: string) => readonly string[];
  readonly isMeIn: (photoId: string) => boolean;
  readonly busy: 'save' | 'share' | null;
  /** What the last action did ("Saved to Photos"), said in the bar: a toast would sit under the viewer. */
  readonly notice: string | null;
  /** Sheets the actions open (confirm a delete or a report), over the whole viewer. */
  readonly overlay?: ReactNode;
  readonly onClose: () => void;
  readonly onRetryPicture: () => void;
  readonly onPick: (photo: AlbumPhoto, picked: boolean) => void;
  readonly onMeIn: (photo: AlbumPhoto, on: boolean) => void;
  readonly onSave: (photo: AlbumPhoto) => void;
  readonly onShare: (photo: AlbumPhoto) => void;
  readonly onReport: (photo: AlbumPhoto) => void;
  readonly onDelete: (photo: AlbumPhoto) => void;
}

const useStyles = makeStyles((t) => ({
  bar: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingTop: t.space['12'],
    gap: t.space['8'],
    backgroundColor: t.color.scrim.hex,
  },
  lines: { paddingHorizontal: t.size.gutter, gap: t.space['2'] },
  actions: { paddingHorizontal: t.size.gutter, gap: t.space['8'] },
}));

export function PhotoViewer(props: PhotoViewerProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { photos, urls } = props;
  const items = useMemo<LightboxItem[]>(
    () =>
      photos.map((photo) => ({
        key: photo.id,
        kind: 'image',
        uri: urls.get(photo.id) ?? null,
      })),
    [photos, urls],
  );

  const bar = (index: number) => {
    const photo = photos[index];
    if (photo === undefined) return props.overlay ?? null;
    const when = photo.takenAt ?? photo.createdAt;
    const uploader = props.nameOf(photo.uploaderId);
    const time = format.date(locale, new Date(when), {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
    const names = format.list(locale, [...props.namesIn(photo.id)]);
    const meIn = props.isMeIn(photo.id);
    const failed = urls.get(photo.id) === null;
    return (
      <>
        <View
          style={[styles.bar, { paddingBottom: insets.bottom + theme.space['12'] }]}
          testID="album-viewer-bar"
        >
          <View style={styles.lines}>
            <Text variant="body" testID="album-viewer-byline">
              {t({ id: 'album.viewer.byline', message: `${uploader} · ${time}` })}
            </Text>
            {names.length === 0 ? null : (
              <Text
                variant="caption"
                color={theme.semantic.text.secondary}
                singleLine={false}
                numberOfLines={2}
                testID="album-viewer-who"
              >
                {t({ id: 'album.viewer.who', message: `In this photo: ${names}` })}
              </Text>
            )}
            {failed ? (
              <>
                <Text variant="caption" singleLine={false} testID="album-viewer-failed">
                  {t({
                    id: 'album.viewer.failed',
                    message: "Couldn't load this photo. Check your connection.",
                  })}
                </Text>
                <TextLink
                  label={t({ id: 'album.viewer.retry', message: 'Try again' })}
                  onPress={props.onRetryPicture}
                  testID="album-viewer-retry"
                />
              </>
            ) : null}
            {props.notice === null ? null : (
              <Text variant="caption" singleLine={false} testID="album-viewer-notice">
                {props.notice}
              </Text>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
            keyboardShouldPersistTaps="handled"
          >
            <PillButton
              label={
                photo.isPick
                  ? t({ id: 'album.viewer.pickOn', message: 'Picked' })
                  : t({ id: 'album.viewer.pickOff', message: 'Pick' })
              }
              onPress={() => props.onPick(photo, !photo.isPick)}
              size="sm"
              tone={photo.isPick ? 'yellow' : 'cream'}
              testID="album-viewer-pick"
            />
            <PillButton
              label={
                meIn
                  ? t({ id: 'album.who.me', message: "I'm in this" })
                  : t({ id: 'album.viewer.meOff', message: 'Add me' })
              }
              onPress={() => props.onMeIn(photo, !meIn)}
              size="sm"
              {...(meIn ? { tone: 'yellow' as const } : { variant: 'secondary' as const })}
              testID="album-viewer-me"
            />
            <PillButton
              label={t({ id: 'album.viewer.save', message: 'Save' })}
              onPress={() => props.onSave(photo)}
              loading={props.busy === 'save'}
              disabled={props.busy !== null}
              size="sm"
              variant="secondary"
              testID="album-viewer-save"
            />
            <PillButton
              label={t({ id: 'album.viewer.share', message: 'Share' })}
              onPress={() => props.onShare(photo)}
              loading={props.busy === 'share'}
              disabled={props.busy !== null}
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
          </ScrollView>
        </View>
        {props.overlay}
      </>
    );
  };

  return (
    <Lightbox
      items={items}
      initialIndex={indexOfKey(items, props.startId)}
      onClose={props.onClose}
      footer={bar}
      testID="album-viewer"
    />
  );
}
