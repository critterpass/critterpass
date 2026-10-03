/**
 * Add to the day (design in code): a curated place from search, one of my saved places, or my
 * own words; a start and end in 15-minute steps; and the planner's fit check shown before it
 * commits, so a clash or a too-short drive is seen first. An organiser adds it; a member suggests it.
 * Everything above the button scrolls inside the sheet, so a long list of places never pushes the
 * times off screen, and the button stays at the foot, which the sheet keeps above the keyboard.
 * Picking a place lets the keyboard down and folds the list to that place, ticked, with the times
 * right under it; tapping it or the search brings the list back, and a new search drops the pick.
 */
import { useLingui } from '@lingui/react/macro';
import { useReducer, useRef, useState } from 'react';
import { Keyboard, View, type ScrollViewInstance } from 'react-native';

import { generateStableId } from '@cp/domain';

import { PillButton } from '@/ui/buttons/PillButton';
import { ListCard } from '@/ui/cards/ListCard';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import { Segmented } from '@/ui/inputs/Segmented';
import { SearchField } from '@/ui/inputs/SearchField';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayFit, type FitWarning } from './fit-check';
import { useLiveRows, type LiveRows } from './live-rows';
import type { DayItem } from './plan-model';
import { NO_PICK, pickStep, shownPlaces } from './add-pick';
import { usePlaceSearch } from './place-search';
import { SearchStates } from './search-states';
import { PLACES_TABLES, SAVED_PLACES_SQL, type PlaceRow } from './queries';
import { TimeRangeField } from './time-range-field';

export type AddSource = 'search' | 'saved' | 'own';
type Source = AddSource;

export interface NewItemDraft {
  readonly stableId: string;
  readonly title: string;
  readonly poiId: string | null;
  readonly category: string | null;
  readonly start: number;
  readonly end: number;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['16'], gap: th.space['12'] },
  foot: { paddingHorizontal: th.size.gutter, paddingTop: th.space['8'] },
}));

/** The first free hour after the day's last timed item (10:00 on an empty day). */
export function nextFreeStart(items: readonly DayItem[]): number {
  const ends = items.flatMap((item) => (item.end === null ? [] : [item.end]));
  const last = ends.length === 0 ? 10 * 60 - 15 : Math.max(...ends);
  return Math.ceil((last + 15) / 15) * 15;
}

export interface AddItemSheetProps {
  readonly destinationId: string | null;
  readonly date: string;
  readonly items: readonly DayItem[];
  readonly tz: string;
  readonly members: readonly string[];
  readonly canApply: boolean;
  readonly warningText: (warning: FitWarning, items: readonly DayItem[]) => string;
  readonly onAdd: (draft: NewItemDraft) => void;
  readonly onClose: () => void;
}

/** The sheet over the local catalogue: search and saved places come from live queries. */
export function AddItemSheet(props: AddItemSheetProps) {
  const { destinationId } = props;
  const [source, setSource] = useState<Source>('search');
  const [query, setQuery] = useState('');
  const search = usePlaceSearch(source === 'search' ? destinationId : null, query);
  const saved = useLiveRows<PlaceRow>(
    SAVED_PLACES_SQL,
    destinationId === null || source !== 'saved' ? null : [destinationId],
    PLACES_TABLES,
  );
  return (
    <AddItemSheetView
      {...props}
      source={source}
      onSource={setSource}
      query={query}
      onQuery={setQuery}
      places={source === 'search' ? search : saved}
    />
  );
}

/** The sheet itself, given the source and query and the places they found. */
export function AddItemSheetView({
  date,
  items,
  tz,
  members,
  canApply,
  warningText,
  onAdd,
  onClose,
  source,
  onSource,
  query,
  onQuery,
  places: found,
}: Omit<AddItemSheetProps, 'destinationId'> & {
  readonly source: AddSource;
  readonly onSource: (next: AddSource) => void;
  readonly query: string;
  readonly onQuery: (next: string) => void;
  readonly places: LiveRows<PlaceRow> & { readonly arriving?: boolean };
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const [own, setOwn] = useState('');
  const theme = useTheme();
  const [pick, dispatch] = useReducer(pickStep, NO_PICK);
  const place = pick.place;
  const first = nextFreeStart(items);
  const [times, setTimes] = useState({ start: first, end: first + 60 });
  const [stableId] = useState(generateStableId);
  const scroll = useRef<ScrollViewInstance>(null);
  const title = source === 'own' ? own.trim() : (place?.name ?? '');
  const candidate: DayItem | null =
    title === ''
      ? null
      : {
          stableId,
          dayNo: 0,
          title,
          category: source === 'own' ? null : (place?.category ?? null),
          start: times.start,
          end: times.end,
          tz,
          lane: null,
          attendeeIds: [],
          lock: null,
          status: 'confirmed',
          byGuide: false,
          notes: null,
          poiId: source === 'own' ? null : (place?.id ?? null),
          place:
            source === 'own' || place?.lat == null || place.lng == null
              ? null
              : { lat: place.lat, lng: place.lng },
          amountMinor: null,
          currency: null,
          costModel: null,
          bookingId: null,
        };
  const withCandidate = candidate === null ? null : [...items, candidate];
  const warnings =
    withCandidate === null
      ? []
      : dayFit(withCandidate, date, members)
          .filter((w) => w.stableId === stableId || w.relatedId === stableId)
          .map((w) => warningText(w, withCandidate));
  const places = shownPlaces(found.rows, pick);
  const arriving = found.arriving === true;
  const folded = place !== null && !pick.browsing;
  const choose = (row: PlaceRow) => {
    dispatch({ type: 'pick', place: row });
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <Sheet
      title={t({ id: 'plan.day.add.title', message: 'Add to the day' })}
      detents={['large']}
      onDismiss={onClose}
      testID="plan-add-sheet"
    >
      <SheetScrollView
        ref={scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        testID="plan-add-scroll"
      >
        <Segmented<Source>
          label={t({ id: 'plan.day.add.from', message: 'Add from' })}
          value={source}
          onChange={(next) => {
            onSource(next);
            dispatch({ type: 'clear' });
          }}
          segments={[
            { value: 'search', label: t({ id: 'plan.day.add.search', message: 'Search' }) },
            { value: 'saved', label: t({ id: 'plan.day.add.saved', message: 'Saved' }) },
            { value: 'own', label: t({ id: 'plan.day.add.own', message: 'Your own' }) },
          ]}
          testID="plan-add-source"
        />
        {source === 'search' ? (
          // A touch on the field opens the list again; a new search drops the pick.
          <View onTouchStart={() => dispatch({ type: 'browse' })}>
            <SearchField
              value={query}
              onChangeText={(next) => {
                onQuery(next);
                dispatch({ type: 'clear' });
              }}
              testID="plan-add-query"
            />
          </View>
        ) : null}
        {source === 'own' ? (
          <TextField
            label={t({ id: 'plan.day.add.ownLabel', message: 'What’s the plan?' })}
            value={own}
            onChangeText={setOwn}
            maxLength={120}
            testID="plan-add-own"
          />
        ) : (
          <Stack gap="6">
            {places.map((row) => {
              const chosen = place?.id === row.id;
              return (
                <ListCard
                  key={row.id}
                  title={row.name}
                  {...(row.category === null ? {} : { subtitle: row.category })}
                  tone={chosen ? 'yellow' : 'raised'}
                  chevron={!chosen}
                  {...(chosen
                    ? {
                        trailing: (
                          <Icon
                            name="check"
                            size={18}
                            color={theme.semantic.text.onAccent}
                            decorative
                          />
                        ),
                      }
                    : {})}
                  onPress={() => (folded ? dispatch({ type: 'browse' }) : choose(row))}
                  testID={`plan-add-place-${row.id}`}
                />
              );
            })}
            {source === 'search' ? (
              <SearchStates
                query={query}
                loaded={found.loaded}
                arriving={arriving}
                found={places.length}
                onUseOwnWords={() => {
                  setOwn(query.trim());
                  onSource('own');
                  dispatch({ type: 'clear' });
                }}
              />
            ) : null}
            {source === 'saved' && found.loaded && places.length === 0 ? (
              <Text variant="bodySm">
                {t({ id: 'plan.day.add.noSaved', message: 'No saved places here yet.' })}
              </Text>
            ) : null}
          </Stack>
        )}
        <TimeRangeField
          start={times.start}
          end={times.end}
          onChange={(start, end) => setTimes({ start, end })}
        />
        {warnings.map((warning) => (
          <InfoPill key={warning} icon="flame">
            {warning}
          </InfoPill>
        ))}
      </SheetScrollView>
      <View style={styles.foot}>
        <PillButton
          label={
            canApply
              ? t({ id: 'plan.day.add.confirm', message: 'Add to the day' })
              : t({ id: 'plan.day.add.suggest', message: 'Suggest to the crew' })
          }
          disabled={candidate === null}
          onPress={() =>
            candidate !== null &&
            onAdd({
              stableId,
              title,
              poiId: candidate.poiId,
              category: candidate.category,
              start: times.start,
              end: times.end,
            })
          }
          testID="plan-add-confirm"
        />
      </View>
    </Sheet>
  );
}
