/**
 * The year-later memory (3m-10) over synced rows, where the anniversary push lands
 * (`/memory/<memoryId>?trip=<tripId>`): holds the trip's streams (the memory and its reactions ride
 * them), signs the photo through the api, sends a reaction (offline it waits in the queue), pitches
 * the place to the crew's destination vote with PLAN A REUNION and goes Home where that vote lives,
 * and shares the memory with the crew's signatures.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
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
import { memberName } from '@/ui/people/member-name';
import { ShareImageSheet } from '@/ui/share-image/ShareImageSheet';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { reactMemoryCommand, startReunionCommand } from '../commands';
import { useLiveRows } from '../data/live-rows';
import { readMediaUrl } from '../data/read-url';
import { fetchStroke } from '../signature/stroke-store';
import { deviceShareDeps } from '../summary/share-card';
import { guideOf, whereNextHref } from '../summary/summary-screen';
import { memoryBody, memoryTitle } from './memory-copy';
import { memoryMoment, reactionChips } from './memory-model';
import { renderMemoryCard } from './memory-share';
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

async function photoBytes(url: string | null): Promise<Uint8Array | null> {
  if (url === null) return null;
  try {
    const response = await fetch(url);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
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

  if (data.memory === null) return <SessionWaiting testID="memory-waiting" />;
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
        onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
        <ShareImageSheet
          visible
          onClose={() => setSharing(false)}
          altText={`${title}. ${body}`}
          formats={['story', 'post']}
          render={async (format) => {
            const [photo, strokes] = await Promise.all([
              photoBytes(photoUrl),
              Promise.all(
                data.signers.map((s) =>
                  s.strokeKey === null ? Promise.resolve(null) : fetchStroke(s.strokeKey),
                ),
              ),
            ]);
            return renderMemoryCard(
              {
                guideKind: guideSticker(guide).kind,
                eyebrow,
                title,
                body,
                photo,
                signers: data.signers.map((signer, index) => ({
                  name: memberName(signer.name),
                  colour: signer.colour ?? resolveMemberStyle(index).color,
                  stroke: strokes[index] ?? null,
                })),
              },
              format,
            );
          }}
          deps={deviceShareDeps()}
        />
      ) : null}
    </>
  );
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const MEMORY_TRIP_SQL = 'SELECT trip_id FROM memories WHERE id = ?';

/** A link without its trip (an older push) finds the trip from a memory already on the phone. */
function MemoryOfTrip({ memoryId }: { readonly memoryId: string }) {
  const trip = useLiveRows<{ trip_id: string }>(MEMORY_TRIP_SQL, [memoryId], ['memories']).rows[0];
  if (trip === undefined) return <SessionWaiting testID="memory-waiting" />;
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
