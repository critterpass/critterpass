/* eslint-disable lingui/no-unlocalized-strings -- design ids and toast keys, never copy. */
/**
 * The album route's screen: the trip's synced album, this device's uploads, the who's-in sheet and
 * "download all" (a zip of the originals, made on the server and kept for 7 days).
 */
import { useLingui } from '@lingui/react/macro';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { readUrl } from '@/features/crew';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { useCommandFeedback } from '@/motion/island-toast';
import { guideIdOr, guideSticker } from '@/ui/avatar/guides';

import { requestAlbumExportCommand, tagSelfInPhotoCommand } from '../commands';
import { albumExportState, useAlbumExportRow } from '../data/album-export';
import { useAlbum } from '../data/use-album';
import { WhoSheet } from '../people/who-sheet';
import { albumRoutes } from '../routes';
import { albumHttp } from '../upload/device-upload';
import { UploadBanner } from '../upload/upload-banner';
import { useAlbumUpload } from '../upload/use-album-upload';
import { AlbumMediaProvider } from './album-media';
import { AlbumView } from './album-view';

const HUB_SCREEN = '3k-1';

export function AlbumScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const album = useAlbum(tripId);
  const uploads = useAlbumUpload(tripId);
  const tag = useCommand(tagSelfInPhotoCommand);
  const exporter = useCommand(requestAlbumExportCommand);
  const exportRow = useAlbumExportRow(tripId, album.me);
  const [who, setWho] = useState<string | null>(null);
  const [asked, setAsked] = useState<{ id: string | null; refused: boolean }>({
    id: null,
    refused: false,
  });
  const opening = useRef(false);
  const guide = guideIdOr(album.trip?.guideSlug);
  const guideName = album.trip?.guideName ?? guideSticker(guide).name;
  // Read once as the screen opens, so a render never reads the clock: a zip past its 7 days goes
  // back to "Download all".
  const [openedAt] = useState(() => Date.now());
  const exportState = albumExportState(
    { row: exportRow, asking: exporter.pending, requestedId: asked.id, refused: asked.refused },
    openedAt,
  );

  async function downloadAll() {
    if (exportState === 'asking' || exportState === 'zipping') return;
    if (exportState === 'ready' && exportRow?.media_key != null) {
      if (opening.current) return;
      opening.current = true;
      const url = await readUrl(albumHttp, exportRow.media_key);
      opening.current = false;
      if (url === null) {
        feedback.emit('error');
        toast.show({
          id: 'album-export',
          title: t({ id: 'album.export.offline', message: 'Needs signal to zip the album' }),
        });
        return;
      }
      void Linking.openURL(url);
      return;
    }
    const exportId = randomUUID();
    const outcome = report(await exporter.send({ trip_id: tripId, export_id: exportId }), {
      id: 'album-export',
      done: t({
        id: 'album.export.started',
        message: 'Zipping the album. The link appears here when it is ready',
      }),
      needsSignal: t({ id: 'album.export.offline', message: 'Needs signal to zip the album' }),
    });
    if (outcome === 'done') setAsked({ id: exportId, refused: false });
    else if (outcome === 'refused') setAsked({ id: null, refused: true });
  }

  const tagged = useMemo(
    () =>
      who === null ? [] : album.tags.filter((row) => row.photoId === who).map((r) => r.userId),
    [who, album.tags],
  );
  const indexOf = (uid: string) =>
    Math.max(
      0,
      album.people.findIndex((p) => p.id === uid),
    );
  const onOpen = useCallback(
    (photoId: string) => router.push(albumRoutes.photo(tripId, photoId)),
    [tripId],
  );
  const onWho = useCallback((photoId: string) => {
    feedback.emit('tick');
    setWho(photoId);
  }, []);

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
        banner={<UploadBanner tripId={tripId} onRetry={uploads.retry} />}
        exportState={exportState}
        backFallback={hrefFor(HUB_SCREEN, { tripId }) ?? '/'}
        onUpload={uploads.pick}
        onOpen={onOpen}
        onWho={onWho}
        onDownloadAll={() => void downloadAll()}
      />
      {who === null ? null : (
        <WhoSheet
          inPhoto={album.people.filter((person) => tagged.includes(person.id))}
          indexOf={indexOf}
          meIn={album.me !== null && tagged.includes(album.me)}
          onMeIn={(on) => void tag.send({ photo_id: who, on, source: 'manual' })}
          onClose={() => setWho(null)}
        />
      )}
    </AlbumMediaProvider>
  );
}
