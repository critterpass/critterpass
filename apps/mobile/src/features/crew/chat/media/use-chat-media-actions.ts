/**
 * Chat media for any view of the chat: photos from the library or camera, a voice note (hold to
 * talk or tap to record), and this device's uploads in flight. The view draws the "+" menu, the
 * recorder and the uploads; this hook owns what each tap does and what went wrong (a refused
 * permission, a picker that failed). Without device media (no provider) `available` is false.
 */
/* eslint-disable lingui/no-unlocalized-strings -- content types, never copy. */
import { useCallback, useState } from 'react';

import type { AttachChoice } from './attach-entries';
import { useChatMedia } from './media-services';
import { useUploadQueue, type UploadFile } from './use-upload-queue';
import { useVoiceRecorder, type FinishedNote } from './use-voice-recorder';

export interface MediaReply {
  /** The message being replied to: a photo or voice note sent now is a reply to it. */
  readonly replyTo: string | null;
  /** The photo or voice note is queued: the reply strip can go. */
  readonly onQueued: () => void;
}

const NO_REPLY: MediaReply = { replyTo: null, onQueued: () => undefined };

export function useChatMediaActions(crewId: string, reply: MediaReply = NO_REPLY) {
  const media = useChatMedia();
  const { items, queue, add } = useUploadQueue(crewId, media);
  const [menu, setMenu] = useState(false);
  const [denied, setDenied] = useState<'library' | 'camera' | null>(null);
  const [failed, setFailed] = useState(false);

  const { replyTo, onQueued } = reply;
  const addMessage = useCallback(
    async (files: readonly UploadFile[]) => {
      await add({ body: '', files, ...(replyTo === null ? {} : { replyTo }) });
      onQueued();
    },
    [add, replyTo, onQueued],
  );
  const onFinished = useCallback(
    (note: FinishedNote) =>
      void addMessage([
        {
          uri: note.uri,
          kind: 'voice',
          contentType: 'audio/mp4',
          durationMs: note.durationMs,
          peaks: note.peaks,
        },
      ]),
    [addMessage],
  );
  const recorder = useVoiceRecorder(media?.recorder ?? null, onFinished);

  const closeMenu = useCallback(() => {
    setMenu(false);
    setDenied(null);
    setFailed(false);
  }, []);

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
      setFailed(false);
      return;
    }
    if (outcome.kind === 'failed') {
      setDenied(null);
      setFailed(true);
      return;
    }
    closeMenu();
    if (outcome.kind !== 'picked' || outcome.photos.length === 0) return;
    await addMessage(
      outcome.photos.slice(0, 10).map((photo) => ({
        uri: photo.uri,
        kind: 'photo' as const,
        contentType: 'image/jpeg',
        w: photo.width,
        h: photo.height,
      })),
    );
  };

  return {
    available: media !== null,
    menu: {
      open: menu,
      denied,
      failed,
      show: () => setMenu(true),
      close: closeMenu,
      choose: (choice: AttachChoice) => void choose(choice),
    },
    recorder,
    openSettings: media?.openSettings ?? (() => undefined),
    uploads: items,
    retryUpload: (id: string) => void queue?.retry(id),
    discardUpload: (id: string) => void queue?.discard(id),
  };
}

export type ChatMediaActions = ReturnType<typeof useChatMediaActions>;
