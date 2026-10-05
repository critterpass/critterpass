/**
 * Crew can't agree (7e-3): the stances live from the synced rows, so another phone's stance shows
 * as soon as it syncs; the guide's two ways from the api, worked out again whenever a stance
 * changes; and SUGGEST or "Put it to a vote" posting a decision vote to crew chat.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, wire values and toast ids, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { dataOf } from '@/data/travel-data/freshness';
import { useTravelRead } from '@/data/travel-data/use-travel-read';
import { impact, toast } from '@/motion';

import { guideFor } from '../format';
import { usePlaceDetailContext } from '../place-detail/context';
import { fromStayLabel, splitCountLabel } from '../place-detail/model';
import { areaFromAddress } from '../place-detail/place-facts';
import { usePoi, useTripCrew } from '../place-queries';
import { useMyUid } from '../queries';
import {
  clearPlaceStanceCommand,
  postPlaceDecisionCommand,
  setPlaceStanceCommand,
} from './commands';
import { useStances, useTripCrewId } from './queries';
import {
  silentLine,
  splitFooter,
  splitOptionsParser,
  suggestPost,
  votePost,
  optionTags,
  type DecisionPost,
  type SplitOptionView,
} from './split-model';
import { SplitView } from './split-view';
import { StancePicker } from './stance-picker';

const optionsCache = new Map<string, { savedAt: string; body: unknown }>();

/** A short, stable key for the stances as they stand (djb2). */
function stanceKey(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export function SplitScreen({
  tripId,
  placeId,
}: {
  readonly tripId: string;
  readonly placeId: string;
}) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const { row } = usePoi(placeId);
  const crew = useTripCrew(tripId);
  const me = useMyUid();
  const stances = useStances(tripId, placeId);
  const context = dataOf(usePlaceDetailContext(placeId, tripId)) ?? null;
  // A new stance is a new read: the options are worked out for the crew as it stands now.
  const key = stanceKey(stances.map((s) => `${s.userId}:${s.stance}:${s.note ?? ''}`).join('|'));
  const read = useTravelRead({
    path: `/v1/trips/${encodeURIComponent(tripId)}/places/${encodeURIComponent(placeId)}/split?k=${key}`,
    schema: splitOptionsParser,
    classify: () => ({ status: 'ok', seenAt: null }),
    cache: {
      get: (k) => optionsCache.get(k),
      set: (k, body, savedAt) => {
        optionsCache.set(k, { savedAt: savedAt.toISOString(), body });
      },
    },
  });
  const options: readonly SplitOptionView[] = dataOf(read) ?? [];
  const [chosen, setChosen] = useState(0);
  // A way she posted from this screen: the buttons give way to the chat, so it is posted once.
  const [posted, setPosted] = useState(false);
  const crewId = useTripCrewId(tripId);
  const say = useCommand(setPlaceStanceCommand);
  const clear = useCommand(clearPlaceStanceCommand);
  const post = useCommand(postPlaceDecisionCommand);

  const member = (uid: string) => {
    const found = crew.find((m) => m.uid === uid);
    return { key: uid, name: found?.name ?? '?', joinIndex: found?.joinIndex ?? 0 };
  };
  const want = stances.filter((s) => s.stance === 'want');
  const ratherNot = stances.filter((s) => s.stance === 'rather_not');
  const said = new Set(stances.map((s) => s.userId));
  const silent = crew.map((m) => m.uid).filter((uid) => !said.has(uid));
  const mine = stances.find((s) => s.userId === me) ?? null;
  const first = (uid: string) => member(uid).name.split(' ')[0] ?? '';
  const guide = guideFor(row?.guide_slug);

  const send = async (decision: DecisionPost) => {
    const result = await post.send({
      trip_id: tripId,
      poi_id: placeId,
      option_ids: [...decision.optionIds],
      mode: decision.mode,
    });
    if (result.kind === 'applied') {
      setPosted(true);
      impact('success');
      toast.show({
        id: `split-posted-${placeId}`,
        title: t({ id: 'explore.split.posted', message: "It's in crew chat as a vote." }),
      });
      return;
    }
    toast.show({
      id: `split-refused-${placeId}`,
      title: t({ id: 'explore.split.refused', message: "That didn't go through" }),
      subtitle: t({ id: 'explore.split.refusedBody', message: 'Nothing was posted. Try again.' }),
    });
  };
  const suggest = suggestPost(options, chosen);
  const vote = votePost(options);
  const footer = splitFooter({
    posted,
    loading: read.status === 'loading',
    options: options.length,
    said: mine !== null,
    canChat: crewId !== null,
  });
  const openChat = () => {
    if (crewId !== null) router.push(`/crew/${crewId}/chat` as Href);
  };
  const stay = context?.fromStay ?? null;
  const meta = [
    areaFromAddress(row?.address, row?.destination_name),
    stay === null ? null : fromStayLabel(stay.minutes, stay.name),
  ].filter((part): part is string => part !== null && part !== '');

  return (
    <SplitView
      name={row?.name ?? ''}
      meta={meta}
      splitLabel={splitCountLabel(want.length, ratherNot.length)}
      guide={guide}
      want={want.map((s) => member(s.userId))}
      ratherNot={ratherNot.map((s) => member(s.userId))}
      silent={silentLine(silent, me, first, (names) => format.list(locale, [...names]))}
      wantNotes={want.flatMap((s) =>
        s.note === null ? [] : [{ member: member(s.userId), note: s.note }],
      )}
      ratherNotNotes={ratherNot.flatMap((s) =>
        s.note === null ? [] : [{ member: member(s.userId), note: s.note }],
      )}
      picker={
        <StancePicker
          key={`${mine?.stance ?? 'none'}:${mine?.note ?? ''}`}
          mine={mine === null ? null : { stance: mine.stance, note: mine.note }}
          busy={say.pending || clear.pending}
          onSay={(stance, note) =>
            void say.send({
              trip_id: tripId,
              poi_id: placeId,
              stance,
              ...(note === null ? {} : { note }),
            })
          }
          onClear={() => void clear.send({ trip_id: tripId, poi_id: placeId })}
        />
      }
      options={options.map((option) => ({
        title: option.title,
        body: option.body,
        tags: optionTags(option, crew.length, locale),
      }))}
      optionsNote={
        read.status === 'loading'
          ? t({ id: 'explore.split.thinking', message: `${guide.name} is working out a way.` })
          : options.length === 0
            ? mine === null
              ? t({
                  id: 'explore.split.noWays',
                  message: 'No way out yet. Say where you stand and I’ll look again.',
                })
              : t({
                  id: 'explore.split.noWaysSaid',
                  message: 'No way out that suits everyone yet. Talk it through in crew chat.',
                })
            : null
      }
      chosen={chosen}
      onChoose={setChosen}
      suggest={
        suggest === null || footer.kind !== 'post'
          ? null
          : { label: suggest.label, onPress: () => void send(suggest) }
      }
      vote={
        vote === null || footer.kind !== 'post'
          ? null
          : { label: vote.label, onPress: () => void send(vote) }
      }
      posting={post.pending}
      chat={
        footer.kind !== 'chat'
          ? undefined
          : {
              label:
                footer.reason === 'posted'
                  ? t({ id: 'explore.split.inChat', message: 'In crew chat · Open' })
                  : t({ id: 'explore.split.openChat', message: 'Open crew chat' }),
              onPress: openChat,
            }
      }
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
