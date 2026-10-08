/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
/**
 * The postcard route opened on one postcard (from an inbox item): a crewmate's postcard shows
 * read-only with a way on to sending your own; the traveller's own, or none, is the composer.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideIdOr } from '@/ui/avatar/guides';

import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { albumHttp } from '../upload/device-upload';
import type { PostcardFormat } from './postcard-pair';
import { PostcardScreen } from './postcard-screen';
import { ReceivedView } from './received-view';

const OPENED_SQL = `
  SELECT format, photo_id, note, created_by FROM postcards
   WHERE id = ? AND trip_id = ? AND deleted_at IS NULL`;

export function OpenedPostcardScreen({
  tripId,
  postcardId,
}: {
  readonly tripId: string;
  readonly postcardId: string | null;
}) {
  const { t } = useLingui();
  const album = useAlbum(tripId);
  const opened = useLiveRows<{
    format: PostcardFormat;
    photo_id: string | null;
    note: string;
    created_by: string;
  }>(OPENED_SQL, postcardId === null ? null : [postcardId, tripId], ['postcards']).rows[0];
  const [own, setOwn] = useState(false);

  if (opened === undefined || album.me === null || opened.created_by === album.me || own) {
    return <PostcardScreen tripId={tripId} />;
  }
  const front = album.photos.find((photo) => photo.id === opened.photo_id) ?? null;
  return (
    <AlbumMediaProvider http={albumHttp}>
      <ReceivedView
        sender={
          album.people.find((person) => person.id === opened.created_by)?.name ||
          t({ id: 'album.formerTraveller', message: 'A former traveller' })
        }
        format={opened.format}
        photoKey={front?.displayKey ?? front?.thumbKey ?? null}
        place={album.trip?.place ?? t({ id: 'album.postcard.placeFallback', message: 'the trip' })}
        note={opened.note}
        guide={guideIdOr(album.trip?.guideSlug)}
        onOwn={() => setOwn(true)}
        onClose={() => goBackOr(hrefFor('3m-1', { tripId }) ?? '/')}
      />
    </AlbumMediaProvider>
  );
}
