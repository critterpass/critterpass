/**
 * The year-later memory's state and actions for any view of it: holds the trip's streams, signs
 * the photo, sends a reaction (offline it waits in the queue), pitches the place to the crew's
 * destination vote (then goes Home where that vote lives) and opens the share sheet. `ready` is
 * null while the memory is absent (still loading, or not on this phone).
 */
import { useLingui } from '@lingui/react/macro';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback, toast } from '@/motion';
import { guideSticker } from '@/ui/premium/stickers/guides';

import { reactMemoryCommand, startReunionCommand } from '../commands';
import { readMediaUrl } from '../data/read-url';
import { guideOf, whereNextHref } from '../summary/summary-screen';
import { memoryBody, memoryTitle } from './memory-copy';
import { memoryMoment, reactionChips } from './memory-model';
import type { MemoryReaction } from './memory-model';
import { useMemory } from './use-memory';

function useSignedUrl(mediaKey: string | null): string | null {
  const [url, setUrl] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (mediaKey === null) return undefined;
    let live = true;
    void readMediaUrl(mediaKey).then((signed) => {
      if (live) setUrl({ key: mediaKey, url: signed });
    });
    return () => {
      live = false;
    };
  }, [mediaKey]);
  return url !== null && url.key === mediaKey ? url.url : null;
}

export function useMemoryScreen(memoryId: string, tripId: string) {
  useTripStreams(tripId);
  const { t } = useLingui();
  const locale = useLocale();
  const data = useMemory(memoryId, tripId);
  const react = useCommand(reactMemoryCommand);
  const reunion = useCommand(startReunionCommand);
  const reunionTrip = useRef<string | null>(null);
  const [reacting, setReacting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const photoUrl = useSignedUrl(data.memory?.photo_media_key ?? null);
  const guide = guideOf(data.trip?.guide_slug ?? null);
  const guideName = data.trip?.guide_name ?? guideSticker(guide).name;
  const chips = useMemo(
    () => reactionChips(data.reactions, data.live, data.viewerId),
    [data.reactions, data.live, data.viewerId],
  );

  const loaded = data.loaded;
  if (data.memory === null) return { loaded, ready: null };
  const memory = data.memory;
  const place = data.trip?.place ?? null;
  const eyebrow = t({ id: 'recap.memory.eyebrow', message: 'One year ago today' });
  const title = memoryTitle(place);
  const body = memoryBody(locale, memory.local_date, memoryMoment(data.stats, memory.text));
  const mine = [...data.live, ...data.reactions.map((r) => ({ userId: r.user_id, ...r }))].find(
    (r) => r.userId === data.viewerId,
  );

  async function onSend(reaction: MemoryReaction) {
    setReacting(false);
    const result = await react.send({
      memory_id: memoryId,
      ...(reaction.emoji === null ? {} : { emoji: reaction.emoji }),
      ...(reaction.text === null ? {} : { text: reaction.text }),
    });
    if (result.kind === 'applied' || result.kind === 'queued') {
      feedback.emit('success');
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'memory-react',
      title: t({ id: 'recap.memory.reactFailed', message: "Couldn't send that reaction" }),
    });
  }

  async function onReunion() {
    if (reunion.pending) return;
    reunionTrip.current ??= Crypto.randomUUID();
    const result = await reunion.send({ memory_id: memoryId, trip_id: reunionTrip.current });
    if (result.kind === 'applied' || result.kind === 'queued') {
      feedback.emit('success');
      router.navigate(whereNextHref(data.trip?.crew_id ?? null));
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'memory-reunion',
      title:
        result.kind === 'unavailable'
          ? t({ id: 'recap.memory.reunionOffline', message: 'Needs signal to pitch it' })
          : t({ id: 'recap.memory.reunionFailed', message: "Couldn't pitch the reunion" }),
    });
  }

  return {
    loaded,
    ready: {
      memory,
      place,
      eyebrow,
      title,
      body,
      photoUrl,
      guideKind: guideSticker(guide).kind,
      guideName,
      chips,
      signers: data.signers,
      mine: mine === undefined ? null : { emoji: mine.emoji, text: mine.text },
      reacting,
      setReacting,
      sharing,
      setSharing,
      onSend: (reaction: MemoryReaction) => void onSend(reaction),
      onReunion: data.inCrew && place !== null ? () => void onReunion() : undefined,
      reunionPending: reunion.pending,
    },
  };
}

export type MemoryScreenState = NonNullable<ReturnType<typeof useMemoryScreen>['ready']>;
