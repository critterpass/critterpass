/**
 * The photo route's screen: the album's photos in the viewer, starting at the one tapped, with
 * picking, tagging oneself, saving, sharing, reporting and deleting wired to their commands.
 * Reporting and deleting ask first. A photo that has left the album says so instead of opening
 * another one.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { commandOutcome } from '@/data/commands/outcome';
import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { goBackOr } from '@/lib/navigation/back';
import { feedback } from '@/motion';

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
import { useViewerUrls } from './use-viewer-urls';
import type { ViewerUrls } from './use-viewer-urls';

const NOTICE_MS = 4000;

/** How the viewer is drawn. */
export interface ViewerLook {
  readonly Viewer: ComponentType<PhotoViewerProps>;
  /** Asks before a delete or a report (the system alert); true goes ahead. */
  readonly ask: (kind: 'delete' | 'report') => Promise<boolean>;
  readonly loading: () => ReactNode;
  /** The page for a photo that has left the album, with the way to the album. */
  readonly missing: (openAlbum: () => void) => ReactNode;
}

export interface ViewerScreenProps {
  readonly tripId: string;
  readonly photoId: string;
  readonly look: ViewerLook;
}

export function ViewerScreen(props: ViewerScreenProps) {
  return (
    <AlbumMediaProvider http={albumHttp}>
      <Viewer {...props} />
    </AlbumMediaProvider>
  );
}

function Viewer({ tripId, photoId, look }: ViewerScreenProps) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const album = useAlbum(tripId);
  const pick = useCommand(setAlbumPickCommand);
  const tag = useCommand(tagSelfInPhotoCommand);
  const remove = useCommand(deletePhotoCommand);
  const report = useCommand(reportPhotoCommand);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
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
  // Decided once, when the album has loaded: the photo asked for is there, or it has left.
  const [found, setFound] = useState<boolean | null>(null);
  if (album.loaded && found === null) setFound(photos.some((photo) => photo.id === photoId));

  if (found === null) return look.loading();
  if (!found || photos.length === 0) return look.missing(() => router.replace(albumHref));

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

  const onDelete = (photo: AlbumPhoto) => {
    void remove.send({ photo_id: photo.id });
    goBackOr(albumHref);
  };
  // Asks with the system alert first.
  const askFirst = (kind: 'delete' | 'report', photo: AlbumPhoto) => {
    void look.ask(kind).then((yes) => {
      if (!yes) return;
      if (kind === 'delete') onDelete(photo);
      else void onReport(photo);
    });
  };

  const Drawn = look.Viewer;
  return (
    <Drawn
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
      overlay={null}
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
      onReport={(photo) => askFirst('report', photo)}
      onDelete={(photo) => askFirst('delete', photo)}
    />
  );
}

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
