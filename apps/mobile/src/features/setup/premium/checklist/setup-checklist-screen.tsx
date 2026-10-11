/**
 * Setup together (4.08 the organiser's checklist, 4.09 a member's own part): the guide's draft
 * strip (days sketched so far; Peek opens the draft), the seven rows in any order once the dates
 * are locked (who has done each, as faces, never what they entered), and for the organiser
 * "Draft with what we have". A member sees their own part first with Set / Star, then the crew's
 * readiness. Rows open their step; getting there and the route have pages of their own.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { format } from '@cp/i18n';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  EmptyState,
  GuideNote,
  ListCard,
  LoadingCritter,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { draftRoutes } from '../../../plan/draft/routes';
import type { ChecklistRow, MemberPartKey } from '../../data/checklist';
import { useSetupChecklist } from '../../data/use-setup-checklist';
import { useMe } from '../../data/use-me';
import { useSetupTrip, type SetupTrip } from '../../data/setup-trip';
import { setupRoutes } from '../../routes';
import type { WizardStep } from '../../shell/steps';
import { ChecklistRowView, crewFaces, DraftStrip, Faces, ReadyBars } from './checklist-parts';
import { copy, partAction, partLine, partTitle, rowLine, rowTitle } from './copy';
import { premiumSetupRoutes } from './routes';

function datesOf(trip: SetupTrip, locale: string): string | null {
  if (trip.startDate === null || trip.endDate === null) return null;
  return format.dateInterval(
    locale,
    new Date(`${trip.startDate}T12:00:00`),
    new Date(`${trip.endDate}T12:00:00`),
    {
      month: 'short',
      day: 'numeric',
    },
  );
}

const ROW_STEP: Partial<Record<ChecklistRow['key'], WizardStep>> = {
  dates: 'when',
  free_days: 'when',
  budget: 'budget',
  must_dos: 'must_dos',
  rooms: 'rooms',
};

const PART_STEP: Readonly<Record<MemberPartKey, WizardStep | null>> = {
  max: 'budget',
  must_do: 'must_dos',
  free_days: 'when',
  getting_there: null,
};

export function SetupChecklistScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  const checklist = useSetupChecklist(trip);
  const locale = useLocale();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const backLabel = copy.back();
  const go = (href: Href | undefined) => {
    if (href !== undefined) router.push(href);
  };
  const hrefOfRow = useMemo(
    () =>
      (key: ChecklistRow['key']): Href | undefined => {
        if (key === 'getting_there') return premiumSetupRoutes.gettingThere(tripId);
        const step = ROW_STEP[key];
        return step === undefined ? undefined : setupRoutes.step(tripId, step);
      },
    [tripId],
  );

  if (trip === undefined || (trip !== null && checklist === undefined)) {
    return (
      <PushScreen title="" backLabel={backLabel} testID="setup-loading">
        <View style={{ paddingTop: theme.space.gap16 * 8 }}>
          <LoadingCritter label={copy.loading()} />
        </View>
      </PushScreen>
    );
  }
  if (trip === null || checklist === undefined) {
    return (
      <PushScreen title="" backLabel={backLabel} testID="setup-missing">
        <EmptyState
          title={copy.missingTitle()}
          line={copy.missingLine()}
          testID="setup-missing-state"
        />
      </PushScreen>
    );
  }

  if (trip.status === 'voting') {
    // Setup opens once the vote has a winner: before that the api refuses every setup change.
    return (
      <PushScreen
        title={copy.title(trip.destinationName)}
        backLabel={backLabel}
        testID="setup-vote-open"
      >
        <EmptyState
          title={copy.voteOpenTitle()}
          line={copy.voteOpenLine()}
          check={false}
          action={<Button label={copy.home()} onPress={() => router.replace('/')} />}
        />
      </PushScreen>
    );
  }
  const guide = guideSticker(trip.guide);
  const dates = datesOf(trip, locale);
  const organiser = trip.members.find((member) => member.organiser);
  const sketched = checklist.tiles.filter((tile) => tile.sketched).length;
  const strip = (
    <DraftStrip
      eyebrow={copy.draftEyebrow(guide.name)}
      title={
        checklist.tiles.length === 0 || sketched === 0
          ? copy.noSketch()
          : copy.sketched(sketched, checklist.tiles.length)
      }
      caption={sketched < checklist.tiles.length && sketched > 0 ? copy.waitsOn() : null}
      peek={sketched > 0 ? copy.peek() : null}
      guide={{ kind: guide.kind, name: guide.name }}
      tiles={checklist.tiles}
      onPeek={() => go(draftRoutes.review(tripId))}
    />
  );
  const rows = checklist.rows.filter((row) => row.state !== 'off');
  const readyLine = copy.ready(checklist.ready.length, checklist.total);

  return (
    <PushScreen
      title={copy.title(trip.destinationName)}
      subtitle={
        trip.isOrganiser
          ? copy.going(dates, trip.members.length)
          : copy.organising(organiser?.name ?? '')
      }
      backLabel={backLabel}
      testID="setup-checklist"
    >
      <View
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        {trip.isOrganiser ? (
          <>
            {strip}
            <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
              {readyLine}
            </Text>
            <ListCard>
              {rows.map((row) => {
                const faces = crewFaces(trip.members, row.done);
                return (
                  <ChecklistRowView
                    key={row.key}
                    disc={row.state === 'done' ? 'done' : 'open'}
                    title={rowTitle(row.key)}
                    line={rowLine(row, {
                      dates,
                      total: checklist.total,
                      stops: row.state === 'done' ? 2 : 1,
                    })}
                    disabled={row.state === 'waiting'}
                    onPress={
                      hrefOfRow(row.key) === undefined ? undefined : () => go(hrefOfRow(row.key))
                    }
                    trailing={
                      row.key === 'dates' && row.state === 'done' ? (
                        <StatusTag tone="booked" label={copy.locked()} />
                      ) : faces.length > 0 ? (
                        <Faces members={faces} label={faces.map((face) => face.name).join(', ')} />
                      ) : undefined
                    }
                    testID={`setup-row-${row.key}`}
                  />
                );
              })}
            </ListCard>
            {checklist.canDraft ? (
              <View style={{ gap: theme.space.gap6, alignItems: 'center' }}>
                <Button
                  label={copy.draftNow()}
                  onPress={() => go(draftRoutes.drafting(tripId))}
                  testID="setup-draft-now"
                />
                <Text variant="caption" tone="muted" align="center">
                  {copy.redrafts(guide.name)}
                </Text>
              </View>
            ) : (
              <GuideNote
                name={guide.name}
                critter={guide.kind}
                text={copy.organiserNote()}
                testID="setup-guide-note"
              />
            )}
          </>
        ) : (
          <>
            <View style={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gap8 }}>
              <Text variant="display" accessibilityRole="header">
                {copy.thingsLeft(checklist.myLeft)}
              </Text>
              <Text variant="body" tone="muted">
                {copy.memberLine()}
              </Text>
            </View>
            <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
              {copy.yourPart()}
            </Text>
            <ListCard>
              {checklist.myPart.map((part) => {
                const step = PART_STEP[part.key];
                const href =
                  step === null
                    ? premiumSetupRoutes.gettingThere(tripId)
                    : setupRoutes.step(tripId, step);
                const waiting = trip.startDate === null && part.key !== 'free_days';
                return (
                  <ChecklistRowView
                    key={part.key}
                    disc={part.done ? 'done' : 'mine'}
                    title={partTitle(part.key)}
                    line={partLine(part.key, part.done, guide.name)}
                    disabled={waiting}
                    onPress={() => go(href)}
                    trailing={
                      part.done ? undefined : (
                        <Button
                          label={partAction(part.key)}
                          size="small"
                          onPress={() => go(href)}
                          testID={`setup-part-${part.key}-action`}
                        />
                      )
                    }
                    testID={`setup-part-${part.key}`}
                  />
                );
              })}
            </ListCard>
            <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap10 }}>
              {copy.theCrew()}
            </Text>
            <View style={{ gap: theme.space.gap10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text variant="rowTitle" style={{ flex: 1 }}>
                  {readyLine}
                </Text>
                <Faces members={crewFaces(trip.members, checklist.ready)} label={readyLine} />
              </View>
              <ReadyBars ready={checklist.ready.length} total={checklist.total} />
            </View>
            {strip}
            <GuideNote
              name={guide.name}
              critter={guide.kind}
              text={copy.memberNote()}
              testID="setup-guide-note"
            />
          </>
        )}
      </View>
    </PushScreen>
  );
}
