/**
 * Lab scenes for the album (3m-2), one photo full screen, and the postcard composer (3m-9), over
 * a Bali crew of five: the guide's picks with its line, everything, by person, the guide still
 * choosing, uploads going up and failed, an empty album, the viewer, the composer in its three
 * formats, after a send, and a printed mailing on its way. Tiles show their colours (no media api
 * in the lab); every handler is a no-op except the segments and the composer's own controls.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { AlbumMediaProvider } from '../grid/album-media';
import { AlbumView, type AlbumViewProps } from '../grid/album-view';
import { AddressScreen } from '../mailing/address-screen';
import { MailingStatus } from '../mailing/mailing-status';
import type { AlbumPerson, AlbumPhoto } from '../data/album-model';
import type { PostcardFormat } from '../postcard/postcard-pair';
import { PostcardView } from '../postcard/postcard-view';
import { ReceivedView } from '../postcard/received-view';
import { PhotoViewer } from '../viewer/photo-viewer';

const noop = () => undefined;
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const PEOPLE: readonly AlbumPerson[] = ['Jon', 'Mai', 'Ana', 'Wes', 'Rin'].map((name, i) => ({
  id: uid(i + 1),
  name,
  colour: null,
}));

function photos(): AlbumPhoto[] {
  const list: AlbumPhoto[] = [];
  for (let i = 0; i < 9; i += 1) {
    const day = i < 6 ? '2026-10-04' : '2026-10-05';
    list.push({
      id: uid(100 + i),
      uploaderId: PEOPLE[i % PEOPLE.length]?.id ?? uid(1),
      thumbKey: null,
      displayKey: null,
      mediaKey: `photo/${i}`,
      localDate: day,
      takenAt: `${day}T0${(i % 9) + 1}:00:00+08:00`,
      createdAt: `${day}T12:00:00Z`,
      isPick: i !== 4,
      uploadState: 'processed',
      width: 4032,
      height: 3024,
    });
  }
  return list;
}

const DAYS = [
  { date: '2026-10-04', dayNo: 4, theme: 'Batur sunrise' },
  { date: '2026-10-05', dayNo: 5, theme: 'Nusa Penida' },
];
const NOTE = "I picked 24 keepers. Nothing blurry, and everyone's in at least three.";

function Album(over: Partial<AlbumViewProps>) {
  return (
    <AlbumMediaProvider http={null}>
      <AlbumView
        loaded
        photos={photos()}
        people={PEOPLE}
        tags={photos().map((photo, i) => ({ photoId: photo.id, userId: PEOPLE[i % 3]?.id ?? '' }))}
        days={DAYS}
        guide="tokek"
        guideName="Tokek"
        curationNote={NOTE}
        uploads={{ uploading: 0, waiting: 0, failed: 0, skipped: 0 }}
        exportState="idle"
        onUpload={noop}
        onRetryUploads={noop}
        onOpen={noop}
        onWho={noop}
        onDownloadAll={noop}
        {...over}
      />
    </AlbumMediaProvider>
  );
}

function Postcard({ sent = false, mailed = false }: { sent?: boolean; mailed?: boolean }) {
  const [format, setFormat] = useState<PostcardFormat>('classic');
  return (
    <AlbumMediaProvider http={null}>
      <PostcardView
        format={format}
        photoKey={null}
        photoCaption="photo · Batur at sunrise"
        place="Bali"
        note="Summit at 06:02, knees at 06:03. Same time next year?"
        signature="W"
        guide="tokek"
        sending={false}
        sentLine={sent ? 'Sent to Jon, Mai, Ana and Rin' : null}
        canSend
        mailing={
          mailed ? (
            <MailingStatus
              mailing={{
                status: 'printed',
                recipientIds: [uid(1), uid(2), uid(3)],
                tracking: {
                  orders: {
                    [uid(1)]: { ref: 'a', status: 'shipped', eta: '2026-10-20', updated_at: '' },
                    [uid(2)]: { ref: 'b', status: 'printed', updated_at: '' },
                    [uid(3)]: { ref: 'c', status: 'sent', updated_at: '' },
                  },
                },
              }}
              notice={{ missing: [uid(4)], unsupported: [uid(5)] }}
              nameOf={(id) => PEOPLE.find((p) => p.id === id)?.name ?? ''}
            />
          ) : null
        }
        onFormat={setFormat}
        onPhoto={noop}
        onNote={noop}
        onSend={noop}
        onMail={noop}
        onClose={noop}
      />
    </AlbumMediaProvider>
  );
}

export const ALBUM_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3m-2-best': () => <Album />,
  '3m-2-all': () => <Album initialSegment="all" />,
  '3m-2-people': () => <Album initialSegment="people" />,
  '3m-2-curating': () => (
    <Album curationNote={null} photos={photos().map((p) => ({ ...p, isPick: false }))} />
  ),
  '3m-2-uploading': () => <Album uploads={{ uploading: 12, waiting: 0, failed: 0, skipped: 0 }} />,
  '3m-2-waiting': () => <Album uploads={{ uploading: 0, waiting: 3, failed: 0, skipped: 0 }} />,
  '3m-2-failed': () => <Album uploads={{ uploading: 0, waiting: 0, failed: 2, skipped: 0 }} />,
  '3m-2-empty': () => <Album photos={[]} curationNote={null} tags={[]} />,
  '3m-2-viewer': () => (
    <AlbumMediaProvider http={null}>
      <PhotoViewer
        photos={photos()}
        startId={uid(100)}
        me={uid(1)}
        organiser={false}
        nameOf={(id) => PEOPLE.find((p) => p.id === id)?.name ?? ''}
        isMeIn={() => true}
        busy={null}
        onClose={noop}
        onPick={noop}
        onMeIn={noop}
        onSave={noop}
        onShare={noop}
        onReport={noop}
        onDelete={noop}
      />
    </AlbumMediaProvider>
  ),
  '3m-9-postcard': () => <Postcard />,
  '3m-9-sent': () => <Postcard sent />,
  '3m-9-mailed': () => <Postcard sent mailed />,
  '3m-9-received': () => (
    <AlbumMediaProvider http={null}>
      <ReceivedView
        sender="Wes"
        format="classic"
        photoKey={null}
        place="Bali"
        note="Summit at 06:02, knees at 06:03. Same time next year?"
        guide="tokek"
        onOwn={noop}
        onClose={noop}
      />
    </AlbumMediaProvider>
  ),
  'album-address': () => <AddressScreen />,
};

export const ALBUM_SCENE_NAMES: readonly string[] = Object.keys(ALBUM_SCENES);
