/**
 * PITCH A PLACE (3b-3): a sheet with the place search on top. Picking a place streams its guide's
 * pitch; OR TRY chips re-pitch an alternative; ADD TO THE VOTE puts the place on the crew's board
 * (starting a new vote when there is none) and flies the card onto the board with the toast
 * "{Place}'s on the board. {in} of {n} have voted." While a final is on, the place is queued for
 * the next board instead ("It joins the vote after this one."); a place already on the board says
 * so and leads back to it. While typing, the matches are wrapping place chips and there is no
 * button yet; ADD TO THE VOTE arrives with the picked place's pitch.
 */
import { useLingui } from '@lingui/react/macro';
import { useRef, type ComponentRef } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';
import { SearchField } from '@/ui/inputs/SearchField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { PlaceResult } from '../data/use-destination-search';
import { money, upper } from '../format';
import { flyToBoard } from './fly-to-board';
import { PitchCard } from './pitch-stream';
import { usePitchSheet } from './use-pitch-sheet';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['16'], gap: th.space['16'] },
  footer: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['16'] },
  // The header row ends 12 pt from the edge (room for a ✕ this sheet does not show); this evens
  // the field with the body's gutter.
  field: { marginEnd: th.size.gutter - th.space['12'] },
  results: { paddingTop: th.space['4'] },
}));

export interface PitchSheetProps {
  readonly crewId: string;
  readonly placeId?: string | undefined;
}

function ResultRows({
  results,
  onPick,
}: {
  readonly results: readonly PlaceResult[];
  readonly onPick: (place: PlaceResult) => void;
}) {
  const styles = useStyles();
  return (
    <Row gap="8" wrap style={styles.results} testID="pitch-results">
      {results.map((result, index) => (
        <QuickActionChip
          key={result.place_id}
          label={result.country === null ? result.name : `${result.name} · ${result.country}`}
          icon="pin"
          onPress={() => onPick(result)}
          testID={`pitch-result-${index}`}
        />
      ))}
    </Row>
  );
}

export function PitchSheet({ crewId, placeId }: PitchSheetProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const card = useRef<ComponentRef<typeof View>>(null);
  const sheet = usePitchSheet({
    crewId,
    placeId,
    sticker: (guide) => <Sticker kind={guide.kind} name={guide.name} size={72} />,
    fly: (sticker) => flyToBoard(card, sticker),
  });
  const { search, state, picked, searching, people, retry, pick } = sheet;
  const asked = search.query;

  return (
    <Sheet
      detents={['large']}
      accessibilityLabel={t({ id: 'vote.pitch.title', message: 'Pitch a place' })}
      header={
        <View style={styles.field}>
          <SearchField
            value={sheet.query}
            onChangeText={sheet.setQuery}
            label={t({ id: 'vote.pitch.search', message: 'Search a place' })}
            autoFocus={placeId === undefined}
            testID="pitch-search"
          />
        </View>
      }
      closable={false}
      testID="pitch-sheet"
    >
      <SheetScrollView keyboardShouldPersistTaps="handled">
        <Stack style={styles.body}>
          {searching && search.results.length > 0 ? (
            <ResultRows
              results={search.results}
              onPick={(place) => pick({ id: place.place_id, name: place.name })}
            />
          ) : null}
          {searching && search.status === 'loading' && search.results.length === 0 ? (
            <Skeleton
              preset="list"
              repeat={3}
              label={t({ id: 'vote.pitch.searching', message: 'Searching places' })}
              testID="pitch-searching"
            />
          ) : null}
          {searching && search.status === 'ready' && search.results.length === 0 ? (
            <Text variant="body" testID="pitch-no-results">
              {t({
                id: 'vote.pitch.none',
                message: `Nothing called “${asked}”. Check the spelling, or try the country.`,
              })}
            </Text>
          ) : null}
          {picked === null && search.status === 'failed' ? (
            <Text variant="body" testID="pitch-search-failed">
              {t({
                id: 'vote.pitch.searchFailed',
                message: "Search didn't answer. Try again in a moment.",
              })}
            </Text>
          ) : null}
          {picked === null && search.status === 'offline' ? (
            <Text variant="body" testID="pitch-offline">
              {t({
                id: 'vote.pitch.offline',
                message: "You're offline. Search comes back with the connection.",
              })}
            </Text>
          ) : null}
          {picked === null ? null : (
            <View ref={card} collapsable={false}>
              <PitchCard state={state} people={people} onRetry={retry} />
            </View>
          )}
          {state.alternatives.length > 0 ? (
            <Row gap="8" align="center" wrap testID="pitch-alternatives">
              <Text variant="eyebrow">
                {upper(t({ id: 'vote.pitch.orTry', message: 'Or try' }), i18n.locale)}
              </Text>
              {state.alternatives.map((alternative) => (
                <QuickActionChip
                  key={alternative.place_id}
                  label={upper(
                    alternative.kind === 'cheaper' &&
                      alternative.delta_minor !== null &&
                      alternative.currency !== null
                      ? t({
                          id: 'vote.pitch.cheaper',
                          message: `${alternative.name} · ${money(i18n.locale, alternative.delta_minor, alternative.currency)} less`,
                        })
                      : t({ id: 'vote.pitch.nearby', message: `${alternative.name} · nearby` }),
                    i18n.locale,
                  )}
                  onPress={() => pick({ id: alternative.place_id, name: alternative.name })}
                  testID={`pitch-alternative-${alternative.place_id}`}
                />
              ))}
            </Row>
          ) : null}
        </Stack>
      </SheetScrollView>
      {picked === null ? null : (
        <View style={styles.footer}>
          <PillButton
            label={sheet.cta}
            onPress={() => void sheet.addToVote()}
            disabled={state.phase === 'streaming'}
            loading={sheet.adding}
            sheen={!sheet.onBoard}
            testID="pitch-add"
          />
        </View>
      )}
    </Sheet>
  );
}
