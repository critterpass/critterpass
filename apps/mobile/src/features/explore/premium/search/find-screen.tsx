/**
 * Find (4.30, 4.31, 4.33, 4.57): the white field with Cancel at the top and, under it, what fits
 * what was typed. Empty: the copied link, the next free window with the guide's ideas, three ways
 * in (swipe together, day trips, crews' plans), two questions to try and kinds to browse. A name
 * lists places as they come; a sentence asks the guide (plain words); a link reads the post; with
 * no signal the phone's places answer and a question waits for the first bar.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/avatar/guides';
import { OfflinePill, usePremiumTheme } from '@/ui/premium';
import { KeyboardAwareScroll } from '@/ui/premium/shell';

import { BROWSE_TILES } from '../../search/browse-tiles';
import { swipeBody, swipeTitle } from '../../trip-explore/copy';
import { plainExamples } from '../../search/plain-examples';
import {
  useSearchController,
  type SearchControllerProps,
} from '../../search/use-search-controller';
import { FindAnswer } from './find-answer';
import { FindClipboard } from './find-clipboard';
import { FindField } from './find-field';
import { FindTypedLink } from './find-typed-link';
import { FindNames } from './find-names';
import { FindOffline } from './find-offline';
import { FindPin } from './find-pin';
import {
  BrowseRow,
  FindGapCard,
  FindHint,
  FindTiles,
  TryAsking,
  type FindTile,
} from './find-start';
import { useFindStart } from './use-find-start';

export function FindScreen(props: SearchControllerProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const find = useSearchController(props);
  const { trip, query, asked, typed, online, search } = find;
  const start = useFindStart(find.tripId, trip.destinationId);
  const critter = guideSticker(trip.guide).kind;
  const tiles: FindTile[] = [
    {
      key: 'swipe',
      title: swipeTitle(),
      line: swipeBody(start.swipe.deckSize),
      doodle: 'heart',
      accent: theme.accent.pink,
      tint: theme.color.status.voteOpen.bg,
      onPress: start.swipe.onPress,
    },
    ...(start.dayTrips === null
      ? []
      : [
          {
            key: 'day-trips',
            title: t({ id: 'explore.premium.find.dayTrips', message: 'Day trips' }),
            line: start.dayTrips.names.slice(0, 2).join(', '),
            doodle: 'boat' as const,
            accent: theme.accent.sun,
            tint: theme.color.status.maybe.bg,
            onPress: start.dayTrips.onPress,
          },
        ]),
    ...(start.crewPlans === null
      ? []
      : [
          {
            key: 'crew-plans',
            title: t({ id: 'explore.premium.find.crewPlans', message: 'Crew plans' }),
            line: t({
              id: 'explore.premium.find.crewPlansLine',
              message: `How other crews did ${trip.destination}`,
            }),
            doodle: 'ticket' as const,
            accent: theme.accent.mint,
            tint: theme.color.status.booked.bg,
            onPress: start.crewPlans.onPress,
          },
        ]),
  ];

  const body =
    find.link !== null ? (
      <FindTypedLink
        guideName={trip.guideName}
        onAdd={() => find.addFromLink(find.link ?? { url: '' })}
      />
    ) : !online && typed !== '' ? (
      <FindOffline
        search={search}
        trip={trip}
        from={find.near}
        queued={find.question.queued}
        onOpen={find.openPoi}
      />
    ) : asked !== null ? (
      <FindAnswer
        key={asked}
        question={asked}
        tripId={find.tripId}
        trip={trip}
        area={find.area}
        whole={find.place === null}
        onOpen={find.openPoi}
        onAdd={(poiId, name) => find.add({ poiId, name })}
        onDropPin={() => find.setPinning({ start: null, name: '' })}
        onChips={find.setChips}
        onAsk={() => find.askGuide(asked)}
      />
    ) : typed === '' ? (
      <>
        <FindClipboard
          state={find.clipboard.state}
          onAdd={find.addFromLink}
          onPasted={find.clipboard.onPasted}
        />
        {start.gap === null ? null : <FindGapCard gap={start.gap} />}
        <FindTiles tiles={tiles} />
        <TryAsking
          examples={plainExamples({
            destination: trip.destination,
            freeWeekday: find.freeWeekday,
            stay: trip.hasStay,
          }).slice(0, 2)}
          onAsk={find.ask}
        />
        <BrowseRow tiles={BROWSE_TILES.slice(0, 6)} onBrowse={find.browse} />
        <FindHint guideName={trip.guideName} />
      </>
    ) : (
      <FindNames
        rows={find.rows}
        state={search.state}
        incomplete={search.incomplete}
        onRetry={search.retry}
        live={find.live}
        pickingLive={find.livePick.picking}
        onPickLive={find.livePick.pick}
        photos={find.photos}
        context={{
          destination: trip.destination,
          from: find.near ?? find.centre,
          addresses: find.knownAddresses,
          planDays: trip.planDays,
        }}
        asked={search.more || search.incomplete || search.state === 'searching' ? undefined : typed}
        addressFound={find.addressState.kind === 'done' && find.addressState.addresses.length > 0}
        guideName={trip.guideName}
        critter={critter}
        onOpen={find.openPlace}
        onAdd={find.addPlace}
        onDropPin={find.dropPin}
        onAsk={() => find.askGuide(typed)}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="search-screen">
      {online ? null : (
        <View style={{ paddingTop: insets.top, paddingHorizontal: theme.space.gap12 }}>
          <OfflinePill
            label={t({
              id: 'search.offline.banner',
              message: 'No signal · working from what’s saved',
            })}
            testID="search-offline-banner"
          />
        </View>
      )}
      <View style={{ paddingTop: online ? insets.top + 2 : theme.space.gap10 }}>
        <FindField
          value={query}
          onChangeText={find.type}
          onSubmit={() => find.ask(query)}
          onCancel={find.cancel}
          guideName={trip.guideName}
          asked={asked !== null}
        />
      </View>
      <KeyboardAwareScroll
        contentContainerStyle={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap16,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        {body}
      </KeyboardAwareScroll>
      {find.pinning === null ? null : (
        <FindPin
          tripId={find.tripId}
          trip={trip}
          start={find.pinning.start ?? find.near}
          name={find.pinning.name}
          hint={find.pinning.near}
          onSaved={find.pinSaved}
          onClose={() => find.setPinning(null)}
        />
      )}
    </View>
  );
}
