/**
 * The photo route's screen: the album's photos in the viewer, starting at the one tapped, with
 * picking, tagging oneself, saving, sharing, reporting and deleting wired to their commands.
 * Reporting and deleting ask first. A photo that has left the album says so instead of opening
 * another one.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { commandOutcome } from '@/data/commands/outcome';
import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { goBackOr } from '@/lib/navigation/back';
import { feedback } from '@/motion';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import {
  deletePhotoCommand,
  reportPhotoCommand,
  setAlbumPickCommand,
  tagSelfInPhotoCommand,
} from '../commands';
import { sortPhotos, type AlbumPhoto } from '../data/album-model';
import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { albumRoutes } from '../routes';
import { albumHttp } from '../upload/device-upload';
import { savePhoto, sharePhoto, type DeviceActionOutcome } from './device-actions';
import { PhotoViewer } from './photo-viewer';
import { useViewerUrls } from './use-viewer-urls';

const NOTICE_MS = 4000;

export function ViewerScreen(props: { readonly tripId: string; readonly photoId: string }) {
  return (
    <AlbumMediaProvider http={albumHttp}>
      <Viewer {...props} />
    </AlbumMediaProvider>
  );
}

function Viewer({ tripId, photoId }: { readonly tripId: string; readonly photoId: string }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const album = useAlbum(tripId);
  const pick = useCommand(setAlbumPickCommand);
  const tag = useCommand(tagSelfInPhotoCommand);
  const remove = useCommand(deletePhotoCommand);
  const report = useCommand(reportPhotoCommand);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [asking, setAsking] = useState<{ kind: 'delete' | 'report'; photo: AlbumPhoto } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    },
    [],
  );
  const say = (line: string, cue: 'success' | 'error') => {
    feedback.emit(cue);
    setNotice(line);
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  const photos = useMemo(() => sortPhotos(album.photos), [album.photos]);
  const pictures = useViewerUrls(photos);
  const albumHref = albumRoutes.album(tripId);
  const backLabel = t({ id: 'album.title', message: 'Photos' });
  // Decided once, when the album has loaded: the photo asked for is there, or it has left.
  const [found, setFound] = useState<boolean | null>(null);
  if (album.loaded && found === null) setFound(photos.some((photo) => photo.id === photoId));

  if (found === null) {
    return (
      <ScreenLoading
        backLabel={backLabel}
        fallback={albumHref}
        label={t({ id: 'album.viewer.loading', message: 'Loading the photo' })}
        testID="album-viewer-loading"
      />
    );
  }
  if (!found || photos.length === 0) {
    return (
      <ScreenMissing
        backLabel={backLabel}
        fallback={albumHref}
        title={t({ id: 'album.viewer.gone.title', message: 'This photo is gone' })}
        line={t({
          id: 'album.viewer.gone.line',
          message: 'It is no longer in the album. Whoever added it may have taken it down.',
        })}
        action={{
          label: t({ id: 'album.viewer.gone.open', message: 'Open the album' }),
          onPress: () => router.replace(albumHref),
        }}
        testID="album-viewer-missing"
      />
    );
  }

  const nameOf = (uid: string) =>
    album.people.find((person) => person.id === uid)?.name ||
    t({ id: 'album.formerTraveller', message: 'A former traveller' });

  async function onDevice(kind: 'save' | 'share', photo: AlbumPhoto) {
    if (busy !== null) return;
    setBusy(kind);
    const key = photo.displayKey ?? photo.mediaKey;
    const outcome: DeviceActionOutcome =
      kind === 'save' ? await savePhoto(albumHttp, key) : await sharePhoto(albumHttp, key);
    setBusy(null);
    if (outcome === 'done') {
      if (kind === 'save')
        say(t({ id: 'album.viewer.saved', message: 'Saved to Photos' }), 'success');
      return;
    }
    say(
      outcome === 'denied'
        ? t({
            id: 'album.viewer.saveDenied',
            message: 'CritterPass needs permission to add to Photos. Turn it on in Settings.',
          })
        : t({ id: 'album.viewer.deviceFailed', message: "Couldn't get the photo. Try again" }),
      'error',
    );
  }

  async function onReport(photo: AlbumPhoto) {
    const outcome = commandOutcome(
      await report.send({ kind: 'photo', id: photo.id, reason: 'other' }),
    );
    if (outcome === 'done' || outcome === 'queued') {
      say(
        t({ id: 'album.viewer.reported', message: 'Thanks. Our team will look at it.' }),
        'success',
      );
    } else {
      say(
        t({ id: 'album.viewer.reportFailed', message: "Couldn't report it. Try again" }),
        'error',
      );
    }
  }

  const overlay =
    asking === null ? null : asking.kind === 'delete' ? (
      <ConfirmSheet
        title={t({ id: 'album.delete.title', message: 'Delete this photo?' })}
        consequences={[
          t({
            id: 'album.delete.line',
            message: 'It leaves the album for the whole crew, and its picks and tags go with it.',
          }),
        ]}
        confirmLabel={t({ id: 'album.delete.confirm', message: 'Delete' })}
        mode="button"
        onConfirm={() => {
          const photo = asking.photo;
          setAsking(null);
          void remove.send({ photo_id: photo.id });
          goBackOr(albumHref);
        }}
        onCancel={() => setAsking(null)}
        testID="album-delete-confirm"
      />
    ) : (
      <ConfirmSheet
        title={t({ id: 'album.report.title', message: 'Report this photo?' })}
        consequences={[
          t({
            id: 'album.report.line',
            message: 'Our team looks at it. The crew is not told who reported it.',
          }),
        ]}
        confirmLabel={t({ id: 'album.viewer.report', message: 'Report' })}
        mode="button"
        onConfirm={() => {
          const photo = asking.photo;
          setAsking(null);
          void onReport(photo);
        }}
        onCancel={() => setAsking(null)}
        testID="album-report-confirm"
      />
    );

  return (
    <PhotoViewer
      photos={photos}
      startId={photoId}
      urls={pictures.urls}
      me={album.me}
      organiser={album.organiser}
      nameOf={nameOf}
      namesIn={(id) =>
        album.tags.filter((row) => row.photoId === id).map((row) => nameOf(row.userId))
      }
      isMeIn={(id) => album.tags.some((row) => row.photoId === id && row.userId === album.me)}
      busy={busy}
      notice={notice}
      overlay={overlay}
      onClose={() => goBackOr(albumHref)}
      onRetryPicture={pictures.retry}
      onPick={(photo, picked) => {
        feedback.emit('tick');
        void pick.send({ photo_id: photo.id, picked });
      }}
      onMeIn={(photo, on) => {
        feedback.emit('tick');
        void tag.send({ photo_id: photo.id, on, source: 'manual' });
      }}
      onSave={(photo) => void onDevice('save', photo)}
      onShare={(photo) => void onDevice('share', photo)}
      onReport={(photo) => setAsking({ kind: 'report', photo })}
      onDelete={(photo) => setAsking({ kind: 'delete', photo })}
    />
  );
}
