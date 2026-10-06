/**
 * A day-trip area's page inside a trip: how to get there from the stop it is linked to, what is
 * there, its map for offline, and adding it as a day trip. The day's area is changed online only:
 * the server answers with the stops it sent back to Ideas, or with why it refused.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast ids and place kinds, never copy. */
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { clearDayAreaCommand, dayAreaOutcome, setDayAreaCommand } from '@/data/areas/commands';
import { dayOfArea } from '@/data/areas/trip-areas-model';
import { useTripAreas } from '@/data/areas/use-trip-areas';
import { useCommand } from '@/data/commands/use-command';
import { heroAt, useDestinationMedia, useSubjectMedia } from '@/data/media/use-subject-media';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { EmptyState } from '@/ui/states/EmptyState';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Sheet } from '@/ui/sheet/Sheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';

import { RegionPackCard } from '../components/region-pack-card';
import { useExploreStream } from '../data/use-explore-stream';
import { estimateText, guideFor, noonUtc, poiSubject } from '../format';
import { useLocalPicks } from '../queries';
import { exploreRoutes } from '../routes';
import { weekdayOfDate } from '../search/weekday-names';
import { PICKS_SHOWN } from '../sponsored-model';
import { areaAction, organiserFirstName, pickerDays } from './area-model';
import { AreaView } from './area-view';
import * as copy from './copy';
import { DayPickerSheet } from './day-picker-sheet';
import { travelLine } from '@/data/areas/travel-line';

export interface AreaScreenProps {
  readonly tripId: string;
  /** The area's destination id. */
  readonly destinationId: string;
}

export function AreaScreen({ tripId, destinationId }: AreaScreenProps) {
  const locale = useLocale();
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  const areas = useTripAreas(tripId, plan.dayRows);
  const online = useSyncStatus().phase !== 'offline';
  const setArea = useCommand(setDayAreaCommand);
  const clearArea = useCommand(clearDayAreaCommand);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const link = useMemo(() => {
    for (const links of areas.dayTrips.values()) {
      const found = links.find((one) => one.toId === destinationId);
      if (found !== undefined) return found;
    }
    return null;
  }, [areas.dayTrips, destinationId]);
  const onDay = dayOfArea(areas, destinationId);
  const stop =
    areas.stops.find((one) => one.destinationId === link?.fromId) ??
    areas.stops[onDay?.stopIndex ?? 0];
  const city = stop?.name ?? plan.trip?.destination_name ?? '';
  const name = link?.toName ?? onDay?.areaName ?? '';
  const guide = guideFor(plan.trip?.guide_slug);
  const photo = heroAt(useDestinationMedia(link?.toSlug ?? null).items);

  useExploreStream(areas.on ? destinationId : null);
  const local = useLocalPicks(areas.on ? destinationId : null, PICKS_SHOWN);
  const pickMedia = useSubjectMedia(
    local.length === 0 ? null : local.map((pick) => poiSubject(pick.poiId)).join(','),
  ).items;

  const fromId = stop?.destinationId ?? null;
  const days = useMemo(
    () => (fromId === null ? [] : pickerDays(areas, plan.state, fromId, destinationId)),
    [areas, plan.state, fromId, destinationId],
  );
  /** "Wed 14 Oct": a day by its date, for the page's line and a chip's spoken name. */
  const dateOf = (date: string) =>
    format.date(locale, noonUtc(date), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(exploreRoutes.tripExplore(tripId));
  };

  if (areas.loaded && plan.loaded && (!areas.on || name === '')) {
    return (
      <Scaffold testID="day-trip-missing">
        <BackEyebrow label={copy.backLabel()} onPress={back} testID="day-trip-back" />
        <EmptyState
          guide={guide.id}
          guideName={guide.name}
          title={copy.refusalLine('not_a_day_trip', guide.name)}
          line={copy.sourcesLine()}
        />
      </Scaffold>
    );
  }

  const action = areaAction({
    organiser: plan.organiser,
    organiserName: organiserFirstName(plan.crew),
    status: plan.trip?.status ?? null,
    online,
    versionId: plan.versionId,
    onDay,
  });

  const refused = (line: string) => toast.show({ id: 'day-trip-refused', title: line });

  const confirm = () => {
    const base = plan.versionId;
    if (chosen === null || base === null || setArea.pending) return;
    const titles = new Map(
      plan.state.items.map((item) => [item.stable_id, plan.display.get(item.stable_id)?.title]),
    );
    void setArea
      .send({ trip_id: tripId, base_version: base, day_no: chosen, destination_id: destinationId })
      .then((sent) => {
        const outcome = dayAreaOutcome(sent);
        if (!outcome.ok) {
          refused(copy.refusalLine(outcome.refusal, guide.name));
          return;
        }
        setPicking(false);
        const moved = (outcome.result.moved_stops ?? []).flatMap((stop_) => {
          const title = titles.get(stop_.stable_id);
          return title == null ? [] : [title];
        });
        toast.show({
          id: 'day-trip-added',
          title: copy.addedToast(name, chosen),
          ...(moved.length === 0 ? {} : { subtitle: copy.movedToast(format.list(locale, moved)) }),
        });
        setChosen(null);
      });
  };

  const remove = () => {
    const base = plan.versionId;
    if (onDay === null || base === null || clearArea.pending) return;
    void clearArea
      .send({ trip_id: tripId, base_version: base, day_no: onDay.dayNo })
      .then((sent) => {
        const outcome = dayAreaOutcome(sent);
        setRemoving(false);
        if (!outcome.ok) refused(copy.refusalLine(outcome.refusal, guide.name));
        else toast.show({ id: 'day-trip-removed', title: copy.removedToast(onDay.dayNo, city) });
      });
  };

  return (
    <>
      <AreaView
        hero={{
          name,
          guide,
          tagline: copy.tagline(city),
          backLabel: copy.backLabel(),
          onBack: back,
          photo,
        }}
        travel={link === null ? null : travelLine(link)}
        length={link?.dayLength == null ? null : copy.lengthTag(link.dayLength)}
        cost={
          link?.cost == null
            ? null
            : copy.costLine(estimateText(locale, link.cost.amountMinor, link.cost.currency))
        }
        note={link?.note ?? null}
        offline={!online}
        picks={local.map((pick) => ({
          id: pick.poiId,
          name: pick.name,
          category: pick.category,
          photo: pickMedia.find((item) => item.subjects.includes(poiSubject(pick.poiId))) ?? null,
        }))}
        placesComing={areas.loaded && local.length === 0}
        onOpenPick={(pick) => router.push(exploreRoutes.place(pick.id, { destinationId, tripId }))}
        pack={
          link?.toSlug == null ? null : (
            <RegionPackCard
              destinationId={destinationId}
              destinationSlug={link.toSlug}
              destinationName={name}
            />
          )
        }
        action={action}
        onDayDate={onDay?.date == null ? null : dateOf(onDay.date)}
        onAdd={() => setPicking(true)}
        onChangeDay={() => setPicking(true)}
        onRemove={() => setRemoving(true)}
      />
      {picking ? (
        <DayPickerSheet
          areaName={name}
          chips={days.map((day) => ({
            dayNo: day.dayNo,
            weekday: weekdayOfDate(day.date) ?? '',
            dateLabel: day.date === null ? undefined : String(Number(day.date.slice(8, 10))),
            color: guide.colour,
            accessibilityLabel: day.date === null ? copy.onDayTag(day.dayNo) : dateOf(day.date),
          }))}
          days={days}
          selectedDayNo={chosen}
          onSelect={setChosen}
          sending={setArea.pending}
          onConfirm={confirm}
          onDismiss={() => {
            setPicking(false);
            setChosen(null);
          }}
        />
      ) : null}
      {removing && onDay !== null ? (
        <Sheet
          detents={['fit']}
          onDismiss={() => setRemoving(false)}
          testID="day-trip-remove-sheet"
        >
          <ConfirmSheet
            mode="button"
            title={copy.removeTitle(name)}
            consequences={[
              copy.removeBackLine(onDay.dayNo, city),
              copy.movesLine(
                plan.state.items.filter(
                  (item) =>
                    item.day_no === onDay.dayNo && item.poi_id != null && item.booking_id == null,
                ).length,
              ),
            ]}
            confirmLabel={copy.removeConfirm()}
            onConfirm={remove}
            onCancel={() => setRemoving(false)}
            testID="day-trip-remove-confirm"
          />
        </Sheet>
      ) : null}
    </>
  );
}
