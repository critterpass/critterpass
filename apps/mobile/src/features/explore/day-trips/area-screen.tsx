/**
 * A day-trip area's page inside a trip: how to get there from the stop it is linked to, what is
 * there, its map for offline, and adding it as a day trip. The day's area is changed online only:
 * the server answers with the stops it sent back to Ideas, or with why it refused.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast ids and place kinds, never copy. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { clearDayAreaCommand, dayAreaOutcome, setDayAreaCommand } from '@/data/areas/commands';
import { dayOfArea } from '@/data/areas/trip-areas-model';
import { useTripAreas } from '@/data/areas/use-trip-areas';
import { useCommand } from '@/data/commands/use-command';
import { heroAt, useDestinationMedia, useSubjectMedia } from '@/data/media/use-subject-media';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { confirmAlert } from '@/ui/premium/shell';

import { ExploreMissingPage } from '../premium/components/missing-page';
import { RegionPackCard } from '../premium/components/region-pack-card';
import { useExploreStream } from '../data/use-explore-stream';
import { estimateText, guideFor, noonUtc, poiSubject } from '../format';
import { useLocalPicks } from '../queries';
import { exploreRoutes } from '../routes';
import { weekdayOfDate } from '../search/weekday-names';
import { PICKS_SHOWN } from '../sponsored-model';
import { areaAction, organiserFirstName, pickerDays } from './area-model';
import * as copy from './copy';
import { PremiumDayPickerSheet } from '../premium/day-trips/day-picker-sheet';
import { travelLine } from '@/data/areas/travel-line';
import type { ReactNode } from 'react';
import { type DestHeroProps } from '../screens/destination-view-props';
import { type PickCard } from '../screens/destination-view-props';
import type { AreaAction } from './area-model';

export interface AreaScreenProps {
  readonly tripId: string;
  /** The area's destination id. */
  readonly destinationId: string;
}

export function AreaScreen({
  tripId,
  destinationId,
  View,
}: AreaScreenProps & {
  /** How the page is drawn; the logic stays here. */
  readonly View: ComponentType<AreaViewProps>;
}) {
  const locale = useLocale();
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  const areas = useTripAreas(tripId, plan.dayRows);
  const online = useSyncPhase() !== 'offline';
  const setArea = useCommand(setDayAreaCommand);
  const clearArea = useCommand(clearDayAreaCommand);
  const [picking, setPicking] = useState(false);
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

  const back = () => goBackOr(exploreRoutes.tripExplore(tripId));

  if (areas.loaded && plan.loaded && (!areas.on || name === '')) {
    return (
      <ExploreMissingPage
        backLabel={copy.backLabel()}
        title={copy.refusalLine('not_a_day_trip', guide.name)}
        line={copy.sourcesLine()}
        onBack={back}
        testID="day-trip-missing"
        backTestID="day-trip-back"
      />
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
        if (!outcome.ok) refused(copy.refusalLine(outcome.refusal, guide.name));
        else toast.show({ id: 'day-trip-removed', title: copy.removedToast(onDay.dayNo, city) });
      });
  };

  // Taking the day trip off asks first: the day goes back to the city and its stops move.
  const askToRemove = async () => {
    if (onDay === null) return;
    const moving = plan.state.items.filter(
      (item) => item.day_no === onDay.dayNo && item.poi_id != null && item.booking_id == null,
    ).length;
    const yes = await confirmAlert({
      title: copy.removeTitle(name),
      message: [copy.removeBackLine(onDay.dayNo, city), copy.movesLine(moving)].join('\n'),
      confirm: copy.removeConfirm(),
      cancel: t({ id: 'common.confirm.cancel', message: 'Cancel' }),
    });
    if (yes) remove();
  };
  return (
    <>
      <View
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
        onRemove={() => void askToRemove()}
      />
      {picking ? (
        <PremiumDayPickerSheet
          areaName={name}
          chips={days.map((day) => ({
            dayNo: day.dayNo,
            weekday: weekdayOfDate(day.date) ?? '',
            dateLabel: day.date === null ? undefined : String(Number(day.date.slice(8, 10))),
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
    </>
  );
}

export interface AreaViewProps {
  readonly hero: Omit<
    DestHeroProps,
    'trailing' | 'saved' | 'onToggleSave' | 'chips' | 'guideArt' | 'bottomRoom'
  >;
  /** "about 3 h 30 by train each way"; null when the link is gone. */
  readonly travel: string | null;
  /** "Full day", before casing. */
  readonly length: string | null;
  /** "about $140 each". */
  readonly cost: string | null;
  readonly note: string | null;
  readonly offline: boolean;
  readonly picks: readonly PickCard[];
  /** The places have not landed yet (and the read has answered). */
  readonly placesComing: boolean;
  readonly onOpenPick?: ((pick: PickCard) => void) | undefined;
  /** The area's map for offline, offered before the day comes. */
  readonly pack?: ReactNode;
  readonly action: AreaAction;
  /** The date of the day it is on, already worded. */
  readonly onDayDate: string | null;
  readonly onAdd: () => void;
  readonly onChangeDay: () => void;
  readonly onRemove: () => void;
}
