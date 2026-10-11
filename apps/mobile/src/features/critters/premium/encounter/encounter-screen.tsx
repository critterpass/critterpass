/**
 * An encounter in the premium UI over the session's encounter engine: the live scene with hold to
 * befriend (8.03), the befriended celebration (8.04) and the gentle miss when it wandered off
 * (8.06). Every state keeps the ✕ top-left; leaving the live scene keeps the encounter running.
 */
/* eslint-disable lingui/no-unlocalized-strings -- rule kinds and Intl options, never copy. */
import { format } from '@cp/i18n';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { useCrowdForecasts } from '@/data/travel-data/shared-content';
import { clockOption } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { openInTabs } from '@/lib/navigation/open-in-tabs';
import { tierWord, useToast } from '@/ui/premium';

import { artKind } from '../../art-kind';
import { useCrewSightings } from '../../data/crew-sightings';
import { useLiveRows, useOwnerUid } from '../../data/live-rows';
import { ME_SQL, ME_TABLES, type MeRow } from '../../data/queries';
import {
  crewChip,
  crewHere,
  formEyebrow,
  onYourPass,
  reminderBody,
  reminderDenied,
  reminderSet,
  reminderTitle,
  whenLabel,
} from '../../encounter/encounter-copy';
import {
  nextQuietWindow,
  SPAWN_FORM_SQL,
  SPAWN_FORM_TABLES,
  spawnArt,
  zoneOffsetMin,
  type SpawnFormRow,
} from '../../encounter/encounter-model';
import { LiveCamera } from '../../encounter/live-camera';
import { REMIND_BEFORE_MS, scheduleQuietReminder } from '../../encounter/quiet-reminder';
import { useEncounter } from '../../engine/use-encounter';
import { deviceTimeZone } from '../../hatch/hatch-model';
import { crewChatRoute, PASS_TAB, passRoute } from '../../routes';
import { BefriendedScene } from './befriended-scene';
import { LiveScene, NothingScene } from './live-scene';
import { WanderedScene } from './wandered-scene';

const LEGENDARY_KINDS = new Set(['window', 'co_presence']);
const TRIP_CREW_SQL = 'SELECT crew_id FROM trips WHERE id = ?';

export function PremiumEncounterScreen({ tz = deviceTimeZone() }: { readonly tz?: string }) {
  const uid = useOwnerUid();
  const locale = useLocale();
  const toast = useToast();
  const { snapshot, befriend, dismiss } = useEncounter();
  const candidate = snapshot.candidate;
  const formRow = useLiveRows<SpawnFormRow>(
    SPAWN_FORM_SQL,
    uid === null || candidate === null ? null : [uid, candidate.rule.form_id],
    SPAWN_FORM_TABLES,
  ).rows[0];
  const forecastRows = dataOf(useCrowdForecasts(candidate?.spot.poiId ?? null))?.curves ?? [];
  const crew = useCrewSightings(candidate?.rule.critter_id ?? '');
  const [now] = useState(() => Date.now());
  const tripId = candidate?.tripId ?? null;
  const tripCrew = useLiveRows<{ crew_id: string | null }>(
    TRIP_CREW_SQL,
    tripId === null ? null : [tripId],
    ['trips'],
  ).rows[0]?.crew_id;
  const activeCrew = useLiveRows<MeRow>(ME_SQL, uid === null ? null : [uid], ME_TABLES).rows[0]
    ?.active_crew_id;
  const crewId = tripCrew ?? activeCrew ?? null;
  const back = () => goBackOr(PASS_TAB);

  const art = candidate === null ? null : spawnArt(candidate.rule, formRow);
  if (candidate === null || art === null || snapshot.phase === 'none') {
    return <NothingScene onBack={back} />;
  }
  const minutes = Math.max(1, Math.round(snapshot.peakDwellS / 60));
  const time = (ms: number) =>
    format.date(locale, new Date(ms), {
      hour: '2-digit',
      minute: '2-digit',
      ...clockOption(),
      timeZone: tz,
    });

  if (snapshot.phase === 'befriended') {
    const add = () => {
      dismiss();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      toast.show({
        kind: 'critter',
        message: onYourPass(),
        critter: { kind: artKind(art.key), name: art.name ?? '' },
      });
      openInTabs(passRoute(candidate.rule.critter_id));
    };
    return (
      <BefriendedScene
        art={art}
        eyebrow={formEyebrow(tierWord(art.rarity), art.formNo, art.formCount)}
        crew={crew}
        crewLine={crew.length === 0 ? null : crewChip(crew.length + 1)}
        minutes={minutes}
        onAdd={add}
        onClose={add}
        onShare={crewId === null ? null : () => router.push(crewChatRoute(crewId))}
      />
    );
  }

  const quiet = nextQuietWindow(forecastRows, now, zoneOffsetMin(tz, new Date(now)));
  const legendary = LEGENDARY_KINDS.has(candidate.rule.kind) || art.rarity === 'legendary';
  if (snapshot.phase === 'wandered_off') {
    const hour = (h: number) =>
      format.date(locale, new Date(Date.UTC(2026, 0, 1, h)), { hour: 'numeric', timeZone: 'UTC' });
    return (
      <WanderedScene
        art={art}
        place={candidate.spot.name}
        habitat={candidate.rule.copy ?? ''}
        minutes={minutes}
        forecast={
          quiet === null
            ? null
            : {
                when: whenLabel(quiet.today, time(quiet.at)),
                remind: time(quiet.at - REMIND_BEFORE_MS),
                bars: quiet.bars,
                litIndex: quiet.litIndex,
                hours: [hour(6), hour(12), hour(18)],
              }
        }
        onRemind={() => {
          if (quiet === null) return;
          void scheduleQuietReminder({
            at: quiet.at,
            title: reminderTitle(candidate.spot.name),
            body: reminderBody(),
          }).then((result) =>
            toast.show(
              result === 'set'
                ? { kind: 'done', message: reminderSet(time(quiet.at - REMIND_BEFORE_MS)) }
                : { kind: 'error', message: reminderDenied() },
            ),
          );
        }}
        onClose={() => {
          dismiss();
          back();
        }}
      />
    );
  }

  return (
    <LiveScene
      art={art}
      place={candidate.spot.name}
      habitat={candidate.rule.copy ?? ''}
      phase={snapshot.phase}
      progress={snapshot.progress}
      legendary={legendary}
      crewLine={crew[0] === undefined ? null : crewHere(crew[0])}
      camera={<LiveCamera />}
      onHold={() => void befriend('hold')}
      onClose={back}
    />
  );
}
