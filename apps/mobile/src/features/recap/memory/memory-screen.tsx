/**
 * The year-later memory (3m-10) over synced rows, where the anniversary push lands
 * (`/memory/<memoryId>?trip=<tripId>`): holds the trip's streams (the memory and its reactions ride
 * them), signs the photo through the api, sends a reaction (offline it waits in the queue), pitches
 * the place to the crew's destination vote with PLAN A REUNION and goes Home where that vote lives,
 * and shares the memory with the crew's signatures.
 */
import { useLingui } from '@lingui/react/macro';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback, toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { goBackOr } from '@/lib/navigation/back';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { reactMemoryCommand, startReunionCommand } from '../commands';
import { useLiveRows } from '../data/live-rows';
import { readMediaUrl } from '../data/read-url';
import { guideOf, whereNextHref } from '../summary/summary-screen';
import { memoryBody, memoryTitle } from './memory-copy';
import { memoryMoment, reactionChips } from './memory-model';
import { MemoryShareSheet } from './memory-share-sheet';
import { MemoryView } from './memory-view';
import { ReactionSheet, type MemoryReaction } from './reaction-sheet';
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

/** The memory is still being read (a wait that can be left), or is not on this phone. */
function MemoryAbsent({ loaded }: { readonly loaded: boolean }) {
  const { t } = useLingui();
  const backLabel = t({ id: 'recap.link.back', message: 'Home' });
  return loaded ? (
    <ScreenMissing
      backLabel={backLabel}
      title={t({ id: 'recap.memory.missing.title', message: 'This memory isn’t here' })}
      line={t({
        id: 'recap.memory.missing.line',
        message: 'It may have been removed, or this phone hasn’t got it yet.',
      })}
      testID="memory-missing"
    />
  ) : (
    <ScreenLoading
      backLabel={backLabel}
      label={t({ id: 'recap.memory.loading', message: 'Loading the memory' })}
      testID="memory-waiting"
    />
  );
}

function Memory({ memoryId, tripId }: { readonly memoryId: string; readonly tripId: string }) {
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

  if (data.memory === null) return <MemoryAbsent loaded={data.loaded} />;
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

  return (
    <>
      <MemoryView
        title={title}
        body={body}
        eyebrow={eyebrow}
        photoUrl={photoUrl}
        guideKind={guideSticker(guide).kind}
        guideName={guideName}
        reactions={chips}
        onClose={() => goBackOr()}
        onReact={() => setReacting(true)}
        onReunion={data.inCrew && place !== null ? () => void onReunion() : undefined}
        reunionPending={reunion.pending}
        onShare={() => setSharing(true)}
      />
      {reacting ? (
        <ReactionSheet
          initial={mine === undefined ? null : { emoji: mine.emoji, text: mine.text }}
          onSend={(reaction) => void onSend(reaction)}
          onClose={() => setReacting(false)}
        />
      ) : null}
      {sharing ? (
        <MemoryShareSheet
          guideKind={guideSticker(guide).kind}
          eyebrow={eyebrow}
          title={title}
          body={body}
          photoUrl={photoUrl}
          signers={data.signers}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </>
  );
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const MEMORY_TRIP_SQL = 'SELECT trip_id FROM memories WHERE id = ?';

/** A link without its trip (an older push) finds the trip from a memory already on the phone. */
function MemoryOfTrip({ memoryId }: { readonly memoryId: string }) {
  const trips = useLiveRows<{ trip_id: string }>(MEMORY_TRIP_SQL, [memoryId], ['memories']);
  const trip = trips.rows[0];
  if (trip === undefined) return <MemoryAbsent loaded={trips.loaded} />;
  return <Memory memoryId={memoryId} tripId={trip.trip_id} />;
}

export function MemoryScreen({
  memoryId,
  tripId,
}: {
  readonly memoryId: string;
  readonly tripId: string | null;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="memory-waiting" />;
  return tripId === null ? (
    <MemoryOfTrip memoryId={memoryId} />
  ) : (
    <Memory memoryId={memoryId} tripId={tripId} />
  );
}
