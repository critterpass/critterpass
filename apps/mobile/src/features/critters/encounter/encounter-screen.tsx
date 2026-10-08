/**
 * The encounter over the session's engine and synced rows: the live scene while the ring fills
 * (a legendary gets its own layer), wandered off with the next quiet window from the crowd
 * forecast, and befriended, whose ADD TO YOUR PASS lands it on the PASS tab with a thud and shows
 * the set it joined. Befriending works offline; the entry shows as pending until the server
 * verifies it. Leaving the live scene keeps the encounter running; the PASS tab's banner leads back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- rule kinds, screen ids, toast keys and Intl options, never copy. */
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useState } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { useCrowdForecasts } from '@/data/travel-data/shared-content';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { openInTabs } from '@/lib/navigation/open-in-tabs';
import { impact, toast } from '@/motion';
import { tierWord } from '@/ui/critters/tier';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

import { useCrewSightings } from '../data/crew-sightings';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { deviceTimeZone } from '../hatch/hatch-model';
import { ME_SQL, ME_TABLES, type MeRow } from '../data/queries';
import { crewChatRoute, PASS_TAB, passRoute } from '../routes';
import { useEncounter } from '../engine/use-encounter';
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
} from './encounter-copy';
import {
  nextQuietWindow,
  SPAWN_FORM_SQL,
  SPAWN_FORM_TABLES,
  spawnArt,
  zoneOffsetMin,
  type SpawnFormRow,
} from './encounter-model';
import { EncounterView } from './encounter-view';
import { LiveCamera } from './live-camera';
import { REMIND_BEFORE_MS, scheduleQuietReminder } from './quiet-reminder';
import { clockOption } from '@/lib/i18n/formats';

const LEGENDARY_KINDS = new Set(['window', 'co_presence']);
const TRIP_CREW_SQL = 'SELECT crew_id FROM trips WHERE id = ?';
const TRIP_CREW_TABLES = ['trips'];

export function EncounterScreen({ tz = deviceTimeZone() }: { readonly tz?: string }) {
  useNoBackByDesign();
  const uid = useOwnerUid();
  const locale = useLocale();
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
  // The crew a find is shared with: the trip's, or the active one for a critter met at home.
  const tripId = candidate?.tripId ?? null;
  const tripCrew = useLiveRows<{ crew_id: string | null }>(
    TRIP_CREW_SQL,
    tripId === null ? null : [tripId],
    TRIP_CREW_TABLES,
  ).rows[0]?.crew_id;
  const activeCrew = useLiveRows<MeRow>(ME_SQL, uid === null ? null : [uid], ME_TABLES).rows[0]
    ?.active_crew_id;
  const crewId = tripCrew ?? activeCrew ?? null;
  const back = () => goBackOr(PASS_TAB);

  const art = candidate === null ? null : spawnArt(candidate.rule, formRow);
  if (candidate === null || art === null || snapshot.phase === 'none') {
    return <EncounterView kind="nothing" onBack={back} />;
  }
  const minutes = Math.max(1, Math.round(snapshot.peakDwellS / 60));
  const hourLabel = (hour: number) =>
    format.date(locale, new Date(Date.UTC(2026, 0, 1, hour)), { hour: 'numeric', timeZone: 'UTC' });
  const time = (ms: number) =>
    format.date(locale, new Date(ms), {
      hour: '2-digit',
      minute: '2-digit',
      ...clockOption(),
      timeZone: tz,
    });

  if (snapshot.phase === 'befriended') {
    return (
      <EncounterView
        kind="befriended"
        art={art}
        eyebrow={formEyebrow(tierWord(art.rarity), art.formNo, art.formCount)}
        formChip={art.name}
        crewChip={crew.length === 0 ? null : crewChip(crew.length + 1)}
        minutes={minutes}
        onAdd={() => {
          dismiss();
          impact('thud.heavy');
          toast.show({ id: `critters-landed-${candidate.rule.form_id}`, title: onYourPass() });
          openInTabs(passRoute(candidate.rule.critter_id));
        }}
        onShare={crewId === null ? null : () => router.push(crewChatRoute(crewId))}
      />
    );
  }

  const quiet = nextQuietWindow(forecastRows, now, zoneOffsetMin(tz, new Date(now)));
  return (
    <EncounterView
      kind={snapshot.phase === 'wandered_off' ? 'wandered' : 'live'}
      place={candidate.spot.name}
      habitat={candidate.rule.copy ?? ''}
      art={art}
      phase={snapshot.phase}
      progress={snapshot.progress}
      legendary={LEGENDARY_KINDS.has(candidate.rule.kind) || art.rarity === 'legendary'}
      crewLine={crew[0] === undefined ? null : crewHere(crew[0])}
      minutes={minutes}
      forecast={
        quiet === null
          ? null
          : {
              when: whenLabel(quiet.today, time(quiet.at)),
              remind: time(quiet.at - REMIND_BEFORE_MS),
              bars: quiet.bars,
              litIndex: quiet.litIndex,
              hours: [hourLabel(6), hourLabel(12), hourLabel(18)],
            }
      }
      camera={<LiveCamera />}
      onHold={() => void befriend('hold')}
      onTap={() => void befriend('accessible')}
      onRemind={() => {
        if (quiet === null) return;
        void scheduleQuietReminder({
          at: quiet.at,
          title: reminderTitle(candidate.spot.name),
          body: reminderBody(),
        }).then((result) =>
          toast.show({
            id: `critters-quiet-${quiet.at}`,
            title:
              result === 'set' ? reminderSet(time(quiet.at - REMIND_BEFORE_MS)) : reminderDenied(),
          }),
        );
      }}
      onBack={() => {
        dismiss();
        back();
      }}
      onLeave={back}
    />
  );
}
