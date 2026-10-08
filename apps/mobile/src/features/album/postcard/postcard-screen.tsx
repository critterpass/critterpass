/* eslint-disable lingui/no-unlocalized-strings -- SQL, design ids and wire codes, never copy. */
/**
 * The postcard route's screen: the traveller's postcard for the trip (their saved one, else the
 * guide's top pick and the recap's note), saved through the offline queue, sent to every other
 * traveller when online, and — with Pass+ — mailed printed to each of them once per trip.
 */
import type { MailPostcardResult } from '@cp/domain';
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { useCommandFeedback } from '@/motion/island-toast';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { guideIdOr } from '@/ui/avatar/guides';

import {
  createPostcardCommand,
  editPostcardCommand,
  mailPostcardCommand,
  sendPostcardCommand,
} from '../commands';
import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { MailingStatus, type MailingNotice } from '../mailing/mailing-status';
import { useMailing } from '../mailing/use-mailing';
import { albumHttp } from '../upload/device-upload';
import {
  clampNote,
  closeStep,
  initialDraft,
  recipientsOf,
  saveStep,
  type PostcardDraft,
  type SavedPostcard,
} from './postcard-draft';
import type { PostcardFormat } from './postcard-pair';
import { NoteSheet, PhotoSheet } from './postcard-sheets';
import { PostcardView } from './postcard-view';

const SAVED_SQL = `
  SELECT id, format, photo_id, note, sent_at FROM postcards
   WHERE trip_id = ? AND created_by = ? AND deleted_at IS NULL
   ORDER BY updated_at DESC LIMIT 1`;
const RECAP_SQL = 'SELECT cards FROM recaps WHERE trip_id = ?';
const PAYWALL_SCREEN = '4e-1';
const RECAP_SCREEN = '3m-1';

function recapNote(cards: unknown): string | null {
  try {
    const parsed = (typeof cards === 'string' ? JSON.parse(cards) : cards) as {
      postcard?: { line?: string; narration?: string };
    } | null;
    return parsed?.postcard?.line ?? parsed?.postcard?.narration ?? null;
  } catch {
    return null;
  }
}

export function PostcardScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const locale = useLocale();
  const { report } = useCommandFeedback();
  const album = useAlbum(tripId);
  const [closing, setClosing] = useState(false);
  const recapHref = hrefFor(RECAP_SCREEN, { tripId }) ?? '/';
  const me = album.me;
  const savedRows = useLiveRows<{
    id: string;
    format: PostcardFormat;
    photo_id: string | null;
    note: string;
    sent_at: string | null;
  }>(SAVED_SQL, me === null ? null : [tripId, me], ['postcards']);
  const recap = useLiveRows<{ cards: unknown }>(RECAP_SQL, [tripId], ['recaps']);
  const { passPlus, mailing } = useMailing(tripId, me);
  const paywall = useScreenHref(PAYWALL_SCREEN, { entry: 'postcard' });
  const create = useCommand(createPostcardCommand);
  const edit = useCommand(editPostcardCommand);
  const send = useCommand(sendPostcardCommand);
  const mail = useCommand(mailPostcardCommand);

  const savedRow = savedRows.rows[0];
  const saved: SavedPostcard | null = useMemo(
    () =>
      savedRow === undefined
        ? null
        : {
            id: savedRow.id,
            format: savedRow.format,
            photoId: savedRow.photo_id,
            note: savedRow.note,
            sentAt: savedRow.sent_at,
          },
    [savedRow],
  );
  const [edited, setDraft] = useState<PostcardDraft | null>(null);
  const [sheet, setSheet] = useState<'note' | 'photo' | null>(null);
  const [sentTo, setSentTo] = useState<readonly string[] | null>(null);
  const [notice, setNotice] = useState<MailingNotice | null>(null);
  const ready = album.loaded && savedRows.loaded && recap.loaded;
  // The first read fixes where the draft starts; the traveller's edits replace it from then on.
  const [start, setStart] = useState<PostcardDraft | null>(null);
  if (ready && start === null) {
    setStart(initialDraft(saved, album.photos, recapNote(recap.rows[0]?.cards)));
  }
  const draft = edited ?? start;

  if (draft === null || start === null) {
    return (
      <ScreenLoading
        backLabel={t({ id: 'album.postcard.backLabel', message: 'Recap' })}
        fallback={recapHref}
        label={t({ id: 'album.postcard.loading', message: 'Loading your postcard' })}
        testID="postcard-loading"
      />
    );
  }
  const nameOf = (uid: string) =>
    album.people.find((person) => person.id === uid)?.name ||
    t({ id: 'album.formerTraveller', message: 'A former traveller' });
  const recipients = recipientsOf(album.people, me);
  const photo = album.photos.find((p) => p.id === draft.photoId) ?? null;
  const myName = album.people.find((person) => person.id === me)?.name ?? '';

  /** Writes the draft (offline-capable); the postcard's id, or null when it could not be saved. */
  async function persist(): Promise<string | null> {
    if (draft === null) return null;
    const newId = randomUUID();
    const step = saveStep(tripId, newId, saved, draft);
    if (step.kind === 'none') return saved?.id ?? null;
    const result =
      step.kind === 'create' ? await create.send(step.payload) : await edit.send(step.payload);
    if (result.kind === 'rejected') return null;
    return step.kind === 'create' ? newId : step.payload.postcard_id;
  }

  /** "Done": the traveller's changes are kept (they wait on the phone without signal), then back. */
  async function onClose() {
    if (closing || draft === null || start === null) return;
    const newId = randomUUID();
    const step = closeStep(tripId, newId, saved, start, draft);
    if (step.kind === 'none') return goBackOr(recapHref);
    setClosing(true);
    const result =
      step.kind === 'create' ? await create.send(step.payload) : await edit.send(step.payload);
    setClosing(false);
    const outcome = report(result, {
      id: 'album-postcard',
      offlineCapable: true,
      done: t({ id: 'album.postcard.kept', message: 'Postcard saved' }),
      refused: t({ id: 'album.postcard.saveFailed', message: "Couldn't save the postcard" }),
    });
    if (outcome !== 'refused') goBackOr(recapHref);
  }

  async function onSend() {
    if (send.pending) return;
    const id = await persist();
    if (id === null)
      return failed(t({ id: 'album.postcard.saveFailed', message: "Couldn't save the postcard" }));
    const result = await send.send({ postcard_id: id, to_uids: recipients });
    if (result.kind === 'applied') {
      feedback.emit('success');
      setSentTo(recipients);
      return;
    }
    if (result.kind === 'unavailable') {
      // The postcard itself is kept; sending is the traveller's to do again, so no error cue.
      toast.show({
        id: 'album-postcard',
        title: t({
          id: 'album.postcard.sendLater',
          message: 'Saved. Send it when you have signal',
        }),
      });
      return;
    }
    failed(t({ id: 'album.postcard.sendFailed', message: "Couldn't send it. Try again" }));
  }

  async function onMail() {
    if (mail.pending) return;
    if (!passPlus) {
      if (paywall !== undefined) router.push(paywall);
      else
        failed(
          t({ id: 'album.postcard.passPlusOnly', message: 'Printed postcards come with Pass+' }),
        );
      return;
    }
    const id = await persist();
    if (id === null)
      return failed(t({ id: 'album.postcard.saveFailed', message: "Couldn't save the postcard" }));
    const result = await mail.send({ postcard_id: id });
    if (result.kind === 'applied') {
      const answer = result.result as MailPostcardResult;
      feedback.emit('success');
      setNotice({ missing: answer.missing_address_ids, unsupported: answer.unsupported_ids });
      return;
    }
    if (
      result.kind === 'rejected' &&
      result.code === 'ENTITLEMENT_REQUIRED' &&
      paywall !== undefined
    ) {
      router.push(paywall);
      return;
    }
    failed(
      result.kind === 'unavailable'
        ? t({ id: 'album.postcard.mailOffline', message: 'Needs signal to order the prints' })
        : result.kind === 'rejected' && result.code === 'STATE_INVALID'
          ? t({
              id: 'album.postcard.mailUsed',
              message: 'This trip already has its printed postcards',
            })
          : t({ id: 'album.postcard.mailFailed', message: "Couldn't order the prints. Try again" }),
    );
  }

  function failed(title: string) {
    feedback.emit('error');
    toast.show({ id: 'album-postcard', title });
  }

  const names = sentTo === null ? '' : format.list(locale, sentTo.map(nameOf));
  const uploader = photo === null ? '' : nameOf(photo.uploaderId);
  const sentLine =
    sentTo !== null
      ? t({ id: 'album.postcard.sentTo', message: `Sent to ${names}` })
      : saved?.sentAt
        ? t({
            id: 'album.postcard.sentBefore',
            message: 'Sent to the crew. Send it again any time',
          })
        : null;

  return (
    <AlbumMediaProvider http={albumHttp}>
      <PostcardView
        format={draft.format}
        photoKey={photo?.displayKey ?? photo?.thumbKey ?? null}
        photoCaption={
          photo === null
            ? null
            : t({ id: 'album.postcard.photoCaption', message: `photo · ${uploader}` })
        }
        place={album.trip?.place ?? t({ id: 'album.postcard.placeFallback', message: 'the trip' })}
        note={draft.note}
        signature={myName.slice(0, 1).toUpperCase()}
        guide={guideIdOr(album.trip?.guideSlug)}
        sending={!closing && (send.pending || create.pending || edit.pending)}
        closing={closing}
        mailingPending={mail.pending}
        sentLine={sentLine}
        canSend={recipients.length > 0}
        mailing={<MailingStatus mailing={mailing} notice={notice} nameOf={nameOf} />}
        onFormat={(next) => setDraft({ ...draft, format: next, note: clampNote(draft.note, next) })}
        onPhoto={() => setSheet('photo')}
        onNote={() => setSheet('note')}
        onSend={() => void onSend()}
        onMail={() => void onMail()}
        onClose={() => void onClose()}
      />
      {sheet === 'note' ? (
        <NoteSheet
          note={draft.note}
          format={draft.format}
          onDone={(note) => {
            setDraft({ ...draft, note });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === 'photo' ? (
        <PhotoSheet
          photos={album.photos}
          selected={draft.photoId}
          onPick={(photoId) => {
            setDraft({ ...draft, photoId });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </AlbumMediaProvider>
  );
}
