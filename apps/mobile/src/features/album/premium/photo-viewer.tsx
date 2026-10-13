/**
 * One album photo full screen in the premium look (undesigned): the app's viewer underneath (swipe
 * across, pinch or double-tap to zoom, drag down to put it away) with the album's bar at its foot
 * on a dark fade: who took it and when, who is in it, and the actions as clear glass pills (pick,
 * "I'm in this", save, share, and delete for the uploader or an organiser, else report). A photo
 * that could not be loaded says so with another try. Deleting and reporting ask with the system
 * alert first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- item kinds and ids, never copy. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { Lightbox } from '@/ui/media/lightbox/Lightbox';
import { indexOfKey, type LightboxItem } from '@/ui/media/lightbox/lightbox-model';
import {
  Button,
  EmptyState,
  GlassPill,
  LoadingCritter,
  Spinner,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert, FullScreen } from '@/ui/premium/shell';

import type { PhotoViewerProps } from '../viewer/photo-viewer';
import type { ViewerLook } from '../viewer/viewer-screen';
import { VIEWER_PAINT } from './viewer-paint';

const ON_PHOTO = VIEWER_PAINT.onPhoto;
const ON_PHOTO_MUTED = VIEWER_PAINT.onPhotoMuted;

export function PremiumPhotoViewer(props: PhotoViewerProps) {
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const { photos, urls } = props;
  const items = useMemo<LightboxItem[]>(
    () =>
      photos.map((photo) => ({ key: photo.id, kind: 'image', uri: urls.get(photo.id) ?? null })),
    [photos, urls],
  );
  const bar = (index: number) => {
    const photo = photos[index];
    if (photo === undefined) return null;
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
    const mine = photo.uploaderId === props.me || props.organiser;
    return (
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]} testID="album-viewer-bar">
        <View style={styles.lines}>
          <Text variant="rowTitle" color={ON_PHOTO} testID="album-viewer-byline">
            {t({ id: 'album.viewer.byline', message: `${uploader} · ${time}` })}
          </Text>
          {names.length === 0 ? null : (
            <Text
              variant="caption"
              color={ON_PHOTO_MUTED}
              singleLine={false}
              numberOfLines={2}
              testID="album-viewer-who"
            >
              {t({ id: 'album.viewer.who', message: `In this photo: ${names}` })}
            </Text>
          )}
          {failed ? (
            <View style={{ alignItems: 'flex-start', gap: 2 }}>
              <Text
                variant="caption"
                color={ON_PHOTO}
                singleLine={false}
                testID="album-viewer-failed"
              >
                {t({
                  id: 'album.viewer.failed',
                  message: "Couldn't load this photo. Check your connection.",
                })}
              </Text>
              <TextButton
                label={t({ id: 'album.viewer.retry', message: 'Try again' })}
                onPress={props.onRetryPicture}
                color={ON_PHOTO}
                testID="album-viewer-retry"
              />
            </View>
          ) : null}
          {props.notice === null ? null : (
            <Text
              variant="caption"
              color={ON_PHOTO}
              singleLine={false}
              testID="album-viewer-notice"
            >
              {props.notice}
            </Text>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actions}
        >
          <GlassPill
            icon={photo.isPick ? 'check' : 'heart'}
            label={
              photo.isPick
                ? t({ id: 'album.viewer.pickOn', message: 'Picked' })
                : t({ id: 'album.viewer.pickOff', message: 'Pick' })
            }
            onPress={() => props.onPick(photo, !photo.isPick)}
            testID="album-viewer-pick"
          />
          <GlassPill
            icon={meIn ? 'check' : 'people'}
            label={
              meIn
                ? t({ id: 'album.who.me', message: "I'm in this" })
                : t({ id: 'album.viewer.meOff', message: 'Add me' })
            }
            onPress={() => props.onMeIn(photo, !meIn)}
            testID="album-viewer-me"
          />
          {props.busy === null ? (
            <>
              <GlassPill
                icon="expand"
                label={t({ id: 'album.viewer.save', message: 'Save' })}
                onPress={() => props.onSave(photo)}
                testID="album-viewer-save"
              />
              <GlassPill
                icon="share"
                label={t({ id: 'album.viewer.share', message: 'Share' })}
                onPress={() => props.onShare(photo)}
                testID="album-viewer-share"
              />
            </>
          ) : (
            <View style={styles.busy} testID="album-viewer-busy">
              <Spinner />
            </View>
          )}
          <GlassPill
            label={
              mine
                ? t({ id: 'album.viewer.delete', message: 'Delete' })
                : t({ id: 'album.viewer.report', message: 'Report' })
            }
            onPress={() => (mine ? props.onDelete(photo) : props.onReport(photo))}
            testID={mine ? 'album-viewer-delete' : 'album-viewer-report'}
          />
        </ScrollView>
      </View>
    );
  };
  // The route is a full-screen cover: black under the viewer, so its fade never shows the ground.
  return (
    <View style={styles.dark}>
      <Lightbox
        items={items}
        initialIndex={indexOfKey(items, props.startId)}
        onClose={props.onClose}
        footer={bar}
        testID="album-viewer"
      />
    </View>
  );
}

function ask(kind: 'delete' | 'report'): Promise<boolean> {
  return kind === 'delete'
    ? confirmAlert({
        title: t({ id: 'album.delete.title', message: 'Delete this photo?' }),
        message: t({
          id: 'album.delete.line',
          message: 'It leaves the album for the whole crew, and its picks and tags go with it.',
        }),
        confirm: t({ id: 'album.delete.confirm', message: 'Delete' }),
        cancel: t({ id: 'album.premium.viewer.keep', message: 'Keep it' }),
      })
    : confirmAlert({
        title: t({ id: 'album.report.title', message: 'Report this photo?' }),
        message: t({
          id: 'album.report.line',
          message: 'Our team looks at it. The crew is not told who reported it.',
        }),
        confirm: t({ id: 'album.viewer.report', message: 'Report' }),
        cancel: t({ id: 'album.premium.viewer.cancel', message: 'Cancel' }),
      });
}

const close = () => t({ id: 'album.premium.viewer.close', message: 'Close' });

function ViewerLoading() {
  return (
    <FullScreen closeLabel={close()} testID="album-viewer-loading">
      <View style={styles.dark}>
        <LoadingCritter label={t({ id: 'album.viewer.loading', message: 'Loading the photo' })} />
      </View>
    </FullScreen>
  );
}

function ViewerMissing({ onOpenAlbum }: { readonly onOpenAlbum: () => void }) {
  const th = usePremiumTheme();
  return (
    <FullScreen closeLabel={close()} overPhoto={false} testID="album-viewer-missing">
      <View style={[styles.center, { backgroundColor: th.color.ground }]}>
        <EmptyState
          title={t({ id: 'album.viewer.gone.title', message: 'This photo is gone' })}
          line={t({
            id: 'album.viewer.gone.line',
            message: 'It is no longer in the album. Whoever added it may have taken it down.',
          })}
          check={false}
          action={
            <Button
              label={t({ id: 'album.viewer.gone.open', message: 'Open the album' })}
              onPress={onOpenAlbum}
            />
          }
        />
      </View>
    </FullScreen>
  );
}

/** The album viewer's premium look: its bar, the system alerts, and its waiting and gone pages. */
export const PREMIUM_VIEWER_LOOK: ViewerLook = {
  Viewer: PremiumPhotoViewer,
  ask,
  loading: () => <ViewerLoading />,
  missing: (openAlbum) => <ViewerMissing onOpenAlbum={openAlbum} />,
};

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    gap: 10,
    experimental_backgroundImage: VIEWER_PAINT.barFade,
  },
  lines: { paddingHorizontal: 20, gap: 2 },
  actions: { paddingHorizontal: 20, gap: 8 },
  busy: { width: 88, alignItems: 'center', justifyContent: 'center' },
  dark: { flex: 1, backgroundColor: VIEWER_PAINT.ground, justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center' },
});
