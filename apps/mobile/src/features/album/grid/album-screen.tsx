/**
 * The album route's screen: the trip's synced album, this device's uploads, the who's-in sheet and
 * "download all" (a zip of the originals the traveller uploaded, ready for 7 days).
 */
import { useLingui } from '@lingui/react/macro';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { feedback, toast } from '@/motion';
import { guideIdOr, guideSticker } from '@/ui/avatar/guides';

import { requestAlbumExportCommand, tagSelfInPhotoCommand } from '../commands';
import { useAlbum } from '../data/use-album';
import { WhoSheet } from '../people/who-sheet';
import { albumRoutes } from '../routes';
import { albumHttp } from '../upload/device-upload';
import { useAlbumUpload } from '../upload/use-album-upload';
import { AlbumMediaProvider } from './album-media';
import { AlbumView } from './album-view';

export function AlbumScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const album = useAlbum(tripId);
  const uploads = useAlbumUpload(tripId);
  const tag = useCommand(tagSelfInPhotoCommand);
  const exporter = useCommand(requestAlbumExportCommand);
  const [who, setWho] = useState<string | null>(null);
  const [exportState, setExportState] = useState<'idle' | 'asking' | 'ready' | 'failed'>('idle');
  const guide = guideIdOr(album.trip?.guideSlug);
  const guideName = album.trip?.guideName ?? guideSticker(guide).name;
  const indexOf = (uid: string) =>
    Math.max(
      0,
      album.people.findIndex((p) => p.id === uid),
    );
  const tagged = (photoId: string) =>
    album.tags.filter((tagRow) => tagRow.photoId === photoId).map((tagRow) => tagRow.userId);

  async function downloadAll() {
    if (exportState === 'asking') return;
    setExportState('asking');
    const result = await exporter.send({ trip_id: tripId, export_id: randomUUID() });
    if (result.kind === 'applied') {
      setExportState('ready');
      feedback.emit('success');
      return;
    }
    setExportState(result.kind === 'unavailable' ? 'idle' : 'failed');
    if (result.kind === 'unavailable') {
      toast.show({
        id: 'album-export-offline',
        title: t({ id: 'album.export.offline', message: 'Needs signal to zip the album' }),
      });
    }
  }

  const whoPhoto = who === null ? [] : tagged(who);
  return (
    <AlbumMediaProvider http={albumHttp}>
      <AlbumView
        loaded={album.loaded}
        photos={album.photos}
        people={album.people}
        tags={album.tags}
        days={album.days}
        guide={guide}
        guideName={guideName}
        curationNote={album.curation?.note ?? null}
        uploads={uploads}
        exportState={exportState}
        onUpload={uploads.pick}
        onRetryUploads={uploads.retry}
        onOpen={(photoId) => router.push(albumRoutes.photo(tripId, photoId))}
        onWho={(photoId) => {
          feedback.emit('tick');
          setWho(photoId);
        }}
        onDownloadAll={() => void downloadAll()}
      />
      {who === null ? null : (
        <WhoSheet
          inPhoto={album.people.filter((person) => whoPhoto.includes(person.id))}
          indexOf={indexOf}
          meIn={album.me !== null && whoPhoto.includes(album.me)}
          onMeIn={(on) => void tag.send({ photo_id: who, on, source: 'manual' })}
          onClose={() => setWho(null)}
        />
      )}
    </AlbumMediaProvider>
  );
}
