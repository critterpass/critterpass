/* eslint-disable lingui/no-unlocalized-strings -- wire values, formats and ids, never copy. */
/**
 * The photo route's screen: the album's photos in the viewer, starting at the one tapped, with
 * picking, tagging oneself, saving, sharing, reporting and deleting wired to their commands.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { feedback, toast } from '@/motion';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import {
  deletePhotoCommand,
  reportPhotoCommand,
  setAlbumPickCommand,
  tagSelfInPhotoCommand,
} from '../commands';
import { sortPhotos, type AlbumPhoto } from '../data/album-model';
import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { albumHttp } from '../upload/device-upload';
import { savePhoto, sharePhoto, type DeviceActionOutcome } from './device-actions';
import { PhotoViewer } from './photo-viewer';

export function ViewerScreen({
  tripId,
  photoId,
}: {
  readonly tripId: string;
  readonly photoId: string;
}) {
  const { t } = useLingui();
  const album = useAlbum(tripId);
  const pick = useCommand(setAlbumPickCommand);
  const tag = useCommand(tagSelfInPhotoCommand);
  const remove = useCommand(deletePhotoCommand);
  const report = useCommand(reportPhotoCommand);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [deleting, setDeleting] = useState<AlbumPhoto | null>(null);
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
      if (kind === 'save') {
        feedback.emit('success');
        toast.show({
          id: 'album-saved',
          title: t({ id: 'album.viewer.saved', message: 'Saved to Photos' }),
        });
      }
      return;
    }
    feedback.emit('error');
    toast.show({
      id: `album-${kind}-failed`,
      title:
        outcome === 'denied'
          ? t({
              id: 'album.viewer.saveDenied',
              message: 'CritterPass needs permission to add to Photos. Turn it on in Settings.',
            })
          : t({ id: 'album.viewer.deviceFailed', message: "Couldn't get the photo. Try again" }),
    });
  }

  if (!album.loaded) return null;
  return (
    <AlbumMediaProvider http={albumHttp}>
      <PhotoViewer
        photos={sortPhotos(album.photos)}
        startId={photoId}
        me={album.me}
        organiser={album.organiser}
        nameOf={nameOf}
        isMeIn={(id) => album.tags.some((row) => row.photoId === id && row.userId === album.me)}
        busy={busy}
        onClose={() => router.back()}
        onPick={(photo, picked) => {
          feedback.emit('tick');
          void pick.send({ photo_id: photo.id, picked });
        }}
        onMeIn={(photo, on) => void tag.send({ photo_id: photo.id, on, source: 'manual' })}
        onSave={(photo) => void onDevice('save', photo)}
        onShare={(photo) => void onDevice('share', photo)}
        onReport={(photo) => {
          void report.send({ kind: 'photo', id: photo.id, reason: 'other' });
          toast.show({
            id: 'album-reported',
            title: t({ id: 'album.viewer.reported', message: 'Thanks. Our team will look at it.' }),
          });
        }}
        onDelete={setDeleting}
      />
      {deleting === null ? null : (
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
            void remove.send({ photo_id: deleting.id });
            setDeleting(null);
            router.back();
          }}
          onCancel={() => setDeleting(null)}
          testID="album-delete-confirm"
        />
      )}
    </AlbumMediaProvider>
  );
}
