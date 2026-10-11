/**
 * Search (7d-1): one field that starts from wherever it was opened (the map's area, a day, a
 * place, or the whole destination). Empty, it offers a copied link, three plain-words examples and
 * kinds of place to browse; typing shows the phone's places at once and the server's after them.
 */
import { AddressSection } from './address-section';
import { BrowseGrid } from './browse-grid';
import { ClipboardCard } from './clipboard-card';
import { DropPinSheet } from './drop-pin-sheet';
import { NameResults } from './name-results';
import { OfflineBanner } from './offline-banner';
import { OfflineSection } from './offline-section';
import { PlainBlock } from './plain-block';
import { SearchView } from './search-view';
import { TypedLinkCard } from './typed-link-card';
import { plainExamples, TypedExamples } from './typed-examples';
import { useSearchController, type SearchControllerProps } from './use-search-controller';

export type SearchScreenProps = SearchControllerProps;

export function SearchScreen(props: SearchScreenProps) {
  const {
    tripId,
    trip,
    place,
    query,
    type,
    ask,
    asked,
    setChips,
    link,
    typed,
    online,
    search,
    rows,
    photos,
    knownAddresses,
    live,
    livePick,
    clipboard,
    near,
    centre,
    addressState,
    addressFirst,
    pickAddress,
    question,
    pinning,
    setPinning,
    pinSaved,
    openPlace,
    openPoi,
    add,
    addPlace,
    dropPin,
    askGuide,
    browse,
    addFromLink,
    freeWeekday,
    cancel,
    scope,
    area,
  } = useSearchController(props);
  const addresses = <AddressSection state={addressState} onPick={pickAddress} />;

  return (
    <SearchView
      header={{
        value: query,
        onChangeText: type,
        onSubmit: () => ask(query),
        onCancel: cancel,
        destination: trip.destination,
        guide: trip.guide,
        guideName: trip.guideName,
        dimmed: !online,
        asked: asked !== null,
      }}
      scope={scope}
      banner={
        !online || question.answered ? (
          <OfflineBanner answered={online && question.answered} guideName={trip.guideName} />
        ) : null
      }
      overlay={
        pinning !== null ? (
          <DropPinSheet
            tripId={tripId}
            destinationId={trip.destinationId}
            destinationSlug={trip.destinationSlug}
            start={pinning.start ?? near}
            name={pinning.name}
            hint={pinning.near}
            onSaved={pinSaved}
            onClose={() => setPinning(null)}
          />
        ) : null
      }
    >
      {link !== null ? (
        <TypedLinkCard link={link} guideName={trip.guideName} onAdd={() => addFromLink(link)} />
      ) : !online && typed !== '' ? (
        <OfflineSection
          search={search}
          trip={trip}
          area={area}
          from={near}
          queued={question.queued}
          onOpen={openPoi}
        />
      ) : asked !== null ? (
        <PlainBlock
          key={asked}
          question={asked}
          tripId={tripId}
          trip={trip}
          area={area}
          whole={place === null}
          onOpen={openPoi}
          onAdd={(poiId, name) => add({ poiId, name })}
          onDropPin={() => setPinning({ start: null, name: '' })}
          addresses={addresses}
          onChips={setChips}
          onAsk={() => askGuide(asked)}
        />
      ) : typed === '' ? (
        <>
          <ClipboardCard
            state={clipboard.state}
            onAdd={addFromLink}
            onPasted={clipboard.onPasted}
          />
          <TypedExamples
            examples={plainExamples({
              destination: trip.destination,
              freeWeekday,
              stay: trip.hasStay,
            })}
            onAsk={ask}
          />
          <BrowseGrid onBrowse={browse} />
        </>
      ) : (
        <>
          {addressFirst ? addresses : null}
          <NameResults
            rows={rows}
            state={search.state}
            live={live}
            photos={photos}
            onOpen={openPlace}
            onAdd={addPlace}
            onPickLive={livePick.pick}
            pickingLive={livePick.picking}
            incomplete={search.incomplete}
            onRetry={search.retry}
            context={{
              destination: trip.destination,
              from: near ?? centre,
              addresses: knownAddresses,
              planDays: trip.planDays,
            }}
            asked={
              search.more || search.incomplete || search.state === 'searching' ? undefined : typed
            }
            addressFound={addressState.kind === 'done' && addressState.addresses.length > 0}
            notFound={{
              guideName: trip.guideName,
              onDropPin: dropPin,
              onAsk: () => askGuide(typed),
            }}
          />
          {addressFirst ? null : addresses}
        </>
      )}
    </SearchView>
  );
}
