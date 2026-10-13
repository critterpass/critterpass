/**
 * Add a must-do in the premium look (undesigned as a sheet; 4.40 stars must-dos in Ideas, and this
 * keeps the setup step's own way in): "{Place} · Must-dos" with "As {name}", the guide's question,
 * the field (return adds the words as typed), the typed words as their own row first, then the
 * guide's matches with their fit, those closed on the trip's dates apart, and live "More places"
 * under them. The shared `AddMustDoSheet` searches, says who is typing and queues the pick.
 */
import { MUST_DO_TITLE_MAX } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Avatar,
  GuideNote,
  Icon,
  ListCard,
  LoadingCritter,
  PressableScale,
  StatusTag,
  Text,
  TextField,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { AddMustDoLook } from '../../must-dos/add-must-do-sheet';
import type { AddSheetViewProps } from '../../must-dos/must-dos-props';
import { pillLabel } from '../../must-dos/lines';
import type { FitPill } from '../../must-dos/model';
import { noteText, type MorePlacesProps } from '../../must-dos/more-places';
import { addSheetRows } from '../../must-dos/result-rows';
import { PremiumWaiting } from './sheet-waiting';

const PILL_TONE: Readonly<Record<FitPill['kind'], StatusTone>> = {
  fits: 'booked',
  tight: 'maybe',
  clash: 'voteOpen',
  book_ahead: 'tangerine',
  lottery: 'tangerine',
};

function ResultRow(props: {
  readonly title: string;
  readonly line: string | null;
  readonly pill?: FitPill | null;
  readonly onPress: () => void;
  readonly label: string;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        paddingVertical: theme.space.gap10,
        paddingHorizontal: theme.space.rowPadH,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{props.title}</Text>
        {props.line === null ? null : (
          <Text variant="captionMuted" tone="muted" numberOfLines={2}>
            {props.line}
          </Text>
        )}
      </View>
      {props.pill == null ? (
        <Icon name="forward" size={16} color={theme.color.placeholder} />
      ) : (
        <StatusTag tone={PILL_TONE[props.pill.kind]} label={pillLabel(props.pill, locale)} />
      )}
    </PressableScale>
  );
}

function PremiumMorePlaces({ state, note, destinationName, onPick }: MorePlacesProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  if (state.kind === 'none' || (state.kind === 'done' && state.places.length === 0)) return null;
  return (
    <View style={{ gap: theme.space.gap8 }} testID="add-must-do-more">
      <Text variant="label" tone="muted">
        {t({ id: 'setup.addMustDo.more.title', message: 'More places' })}
      </Text>
      {state.kind === 'loading' ? (
        <LoadingCritter
          label={t({ id: 'setup.addMustDo.more.searching', message: 'Looking further' })}
        />
      ) : (
        <>
          <ListCard>
            {state.places.map((place) => (
              <View key={place.fsqPlaceId}>
                <ResultRow
                  title={place.name}
                  line={place.address}
                  onPress={() => onPick(place)}
                  label={[place.name, place.address].filter(Boolean).join(', ')}
                  testID={`add-must-do-more-${place.fsqPlaceId}`}
                />
                {note?.fsqPlaceId === place.fsqPlaceId ? (
                  <Text
                    variant="caption"
                    tone="muted"
                    style={{ paddingHorizontal: theme.space.rowPadH, paddingBottom: 8 }}
                    testID="add-must-do-more-note"
                  >
                    {noteText(note.kind, destinationName)}
                  </Text>
                ) : null}
              </View>
            ))}
          </ListCard>
          <Text variant="captionMuted" tone="placeholder">
            {t({ id: 'setup.addMustDo.more.attribution', message: 'Powered by Foursquare' })}
          </Text>
        </>
      )}
    </View>
  );
}

function PremiumAddSheetView(props: AddSheetViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { trip, me, query, search } = props;
  const guide = guideSticker(trip.guide);
  const place = trip.destinationName;
  const guideName = guide.name;
  const name = me.name;
  const typed = query.trim();
  const rows = addSheetRows(typed, search);
  const title = t({ id: 'setup.addMustDo.header', message: `${place} · Must-dos` });
  const keep = rows.some((row) => row.kind === 'keep');
  return (
    <SheetScreen
      title={title}
      cancelLabel={t({ id: 'setup.premium.cancel', message: 'Cancel' })}
      testID="add-must-do"
    >
      <View
        style={{
          paddingHorizontal: theme.space.gutter,
          paddingTop: theme.space.gap8,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap6 }}>
          <Avatar name={name} color={crewColour(me.joinIndex)} size={24} />
          <Text variant="caption" tone="muted">
            {t({ id: 'setup.addMustDo.as', message: `As ${name}` })}
          </Text>
        </View>
        <GuideNote
          name={guideName}
          critter={guide.kind}
          text={t({
            id: 'setup.addMustDo.prompt',
            message: `${name}, what’s the one thing ${place} isn’t complete without?`,
          })}
        />
        <TextField
          accessibilityLabel={t({
            id: 'setup.addMustDo.search',
            message: 'A place or your own words',
          })}
          placeholder={t({ id: 'setup.addMustDo.search', message: 'A place or your own words' })}
          value={query}
          onChangeText={props.onQuery}
          autoFocus
          autoCorrect={false}
          maxLength={MUST_DO_TITLE_MAX}
          returnKeyType="done"
          returnKeyLabel={t({ id: 'setup.addMustDo.returnKey', message: 'Add' })}
          {...(typed === '' ? {} : { onSubmitEditing: props.onKeepText })}
          testID="add-must-do-field"
        />
        {keep ? (
          <ListCard>
            <ResultRow
              title={`“${typed}”`}
              line={t({ id: 'setup.addMustDo.keep', message: 'Keep it just as you typed it' })}
              onPress={props.onKeepText}
              label={t({
                id: 'setup.addMustDo.keepA11y',
                message: `Add “${typed}” as you typed it`,
              })}
              testID="add-must-do-keep"
            />
          </ListCard>
        ) : null}
        {rows.map((row, index) => {
          switch (row.kind) {
            case 'loading':
              return (
                <LoadingCritter
                  key="loading"
                  label={t({ id: 'setup.addMustDo.loading', message: 'Looking for places' })}
                />
              );
            case 'found':
              return (
                <Text key="found" variant="label" tone="muted">
                  {t({ id: 'setup.addMustDo.found', message: `${guideName} found` })}
                </Text>
              );
            case 'offline':
              return (
                <Text key="offline" variant="caption" tone="muted">
                  {t({
                    id: 'setup.addMustDo.offlineSaved',
                    message:
                      'No signal: these are the places on your phone. Your pick sends when you’re back.',
                  })}
                </Text>
              );
            case 'none':
              return (
                <Text key="none" variant="caption" tone="muted" testID="add-must-do-none">
                  {row.offline
                    ? t({
                        id: 'setup.addMustDo.offline',
                        message:
                          'No signal, so no new places. Keep your own words and it sends when you’re back.',
                      })
                    : t({
                        id: 'setup.addMustDo.noResults',
                        message: `No place matches that in ${place}. Keep it in your own words.`,
                      })}
                </Text>
              );
            case 'closed':
              return (
                <Text key="closed" variant="label" tone="muted" testID="add-must-do-closed">
                  {t({ id: 'setup.addMustDo.closed', message: 'Closed on your dates' })}
                </Text>
              );
            case 'place': {
              // The first place of a run draws the whole run in one card.
              if (rows[index - 1]?.kind === 'place') return null;
              const end = rows.findIndex((next, at) => at > index && next.kind !== 'place');
              const run = rows.slice(index, end === -1 ? undefined : end);
              return (
                <ListCard key={row.place.id}>
                  {run.map((entry) =>
                    entry.kind !== 'place' ? null : (
                      <ResultRow
                        key={entry.place.id}
                        title={entry.place.name}
                        line={entry.place.blurb}
                        pill={entry.place.pill}
                        onPress={() => props.onPickPlace(entry.place)}
                        label={[entry.place.name, entry.place.blurb].filter(Boolean).join(', ')}
                        testID={`add-must-do-place-${entry.place.id}`}
                      />
                    ),
                  )}
                </ListCard>
              );
            }
            case 'keep':
              return null;
          }
        })}
        {typed === '' ? null : props.more}
      </View>
    </SheetScreen>
  );
}

export const PREMIUM_ADD_MUST_DO: AddMustDoLook = {
  Sheet: PremiumAddSheetView,
  More: PremiumMorePlaces,
  Waiting: PremiumWaiting,
};
