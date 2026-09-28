/**
 * Wires chat media into the screen: the "+" menu (photos from the library or camera, a hands-free
 * voice note, other features' entries), the mic's hold-to-talk and tap-to-record, the recorder bar,
 * and this device's uploads at the foot of the timeline. Without device media (no provider) the
 * composer shows no "+" and no mic actions.
 */
/* eslint-disable lingui/no-unlocalized-strings -- content types, never copy. */
import { useCallback, useState, type ReactNode } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { AttachMenu, type AttachChoice } from './attach-menu';
import { useChatMedia } from './media-services';
import { PendingUploads } from './pending-uploads';
import { useUploadQueue } from './use-upload-queue';
import { useVoiceRecorder, VoiceRecorderBar, type FinishedNote } from './voice-recorder';

export interface MediaControls {
  readonly composer: {
    readonly onAttach?: () => void;
    readonly onMicTap?: () => void;
    readonly onHoldStart?: () => void;
    readonly onHoldEnd?: () => void;
    readonly recording: boolean;
  };
  /** Above the composer: the recorder bar or the microphone's denied card. */
  readonly bar: ReactNode;
  /** In the list footer: uploads in flight. */
  readonly uploads: ReactNode;
  /** The attach sheet, when open. */
  readonly sheet: ReactNode;
}

export function useMediaControls(crewId: string, online: boolean): MediaControls {
  const media = useChatMedia();
  const { network } = useLocalFirst();
  const { items, queue, add } = useUploadQueue(crewId, media);
  const [menu, setMenu] = useState(false);
  const [denied, setDenied] = useState<'library' | 'camera' | null>(null);

  const onFinished = useCallback(
    (note: FinishedNote) =>
      void add({
        body: '',
        files: [
          {
            uri: note.uri,
            kind: 'voice',
            contentType: 'audio/mp4',
            durationMs: note.durationMs,
            peaks: note.peaks,
          },
        ],
      }),
    [add],
  );
  const recorder = useVoiceRecorder(media?.recorder ?? null, onFinished);

  const choose = async (choice: AttachChoice) => {
    if (media === null) return;
    if (choice === 'voice') {
      setMenu(false);
      recorder.onMicTap();
      return;
    }
    const outcome = await media.pickPhotos(choice);
    if (outcome.kind === 'denied') {
      setDenied(choice);
      return;
    }
    setMenu(false);
    setDenied(null);
    if (outcome.kind !== 'picked' || outcome.photos.length === 0) return;
    await add({
      body: '',
      files: outcome.photos.slice(0, 10).map((photo) => ({
        uri: photo.uri,
        kind: 'photo' as const,
        contentType: 'image/jpeg',
        w: photo.width,
        h: photo.height,
      })),
    });
  };

  if (media === null) {
    return { composer: { recording: false }, bar: null, uploads: null, sheet: null };
  }
  return {
    composer: {
      onAttach: () => setMenu(true),
      onMicTap: recorder.onMicTap,
      onHoldStart: recorder.onHoldStart,
      onHoldEnd: recorder.onHoldEnd,
      recording: recorder.state === 'holding' || recorder.state === 'locked',
    },
    bar: (
      <VoiceRecorderBar
        state={recorder.state}
        elapsed={recorder.elapsed}
        onSend={recorder.send}
        onCancel={recorder.cancel}
        onOpenSettings={media.openSettings}
        onDismissDenied={recorder.dismissDenied}
      />
    ),
    uploads:
      items.length === 0 ? null : (
        <PendingUploads
          items={items}
          online={online && network.isOnline()}
          onRetry={(id) => void queue?.retry(id)}
          onDiscard={(id) => void queue?.discard(id)}
        />
      ),
    sheet: menu ? (
      <AttachMenu
        crewId={crewId}
        denied={denied}
        onChoose={(choice) => void choose(choice)}
        onOpenSettings={media.openSettings}
        onClose={() => {
          setMenu(false);
          setDenied(null);
        }}
      />
    ) : null,
  };
}
