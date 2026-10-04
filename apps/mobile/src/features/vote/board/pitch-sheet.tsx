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
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';
import { SearchField } from '@/ui/inputs/SearchField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { useOpenDestinationPoll } from '../data/use-board';
import { useDestinationSearch, type PlaceResult } from '../data/use-destination-search';
import { useMyUid } from '../data/use-my-uid';
import { usePeople } from '../data/use-people';
import { usePitchStream } from '../data/use-pitch-stream';
import { usePoll } from '../data/use-poll';
import { addPollCandidateCommand } from '../data/vote-commands';
import { guideOr, money, upper } from '../format';
import { flyToBoard } from './fly-to-board';
import { PitchCard } from './pitch-stream';

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
  const me = useMyUid();
  const people = usePeople(crewId);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    placeId === undefined ? null : { id: placeId, name: '' },
  );
  const search = useDestinationSearch(picked === null ? query : '');
  const { state, retry } = usePitchStream(picked === null ? null : { crewId, placeId: picked.id });
  const openPollId = useOpenDestinationPoll(crewId);
  const { poll } = usePoll(openPollId, me);
  const add = useCommand(addPollCandidateCommand);
  const card = useRef<ComponentRef<typeof View>>(null);
  const name = state.sticker?.name ?? picked?.name ?? '';
  const onBoard = poll?.options.some((option) => option.refId === picked?.id) === true;

  const pick = (place: { id: string; name: string }) => {
    setPicked(place);
    setQuery(place.name);
  };

  const addToVote = async () => {
    if (picked === null) return;
    if (onBoard) {
      router.back();
      return;
    }
    await add.send({
      crew_id: crewId,
      place_id: picked.id,
      ...(state.pitchId === null ? {} : { pitch_id: state.pitchId }),
    });
    const guide = guideSticker(guideOr(state.sticker?.guide));
    const sticker = <Sticker kind={guide.kind} name={guide.name} size={72} />;
    if (poll?.stage === 'final') {
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `pitch-queued-${picked.id}`,
        sticker,
        title: t({
          id: 'vote.pitch.queuedToast',
          message: `${name} is pitched. It joins the vote after this one.`,
        }),
      });
    } else {
      const total = poll?.eligibleIds.length ?? people.size;
      const count = poll?.votedCount ?? 0;
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `pitch-added-${picked.id}`,
        sticker,
        title: t({
          id: 'vote.pitch.addedToast',
          message: `${name}'s on the board. ${count} of ${total} have voted.`,
        }),
      });
      await flyToBoard(card, sticker);
    }
    router.back();
  };

  const cta = onBoard
    ? t({ id: 'vote.pitch.onBoard', message: 'Already on the board' })
    : t({ id: 'vote.pitch.add', message: 'Add to the vote' });

  return (
    <Sheet
      detents={['large']}
      accessibilityLabel={t({ id: 'vote.pitch.title', message: 'Pitch a place' })}
      header={
        <View style={styles.field}>
          <SearchField
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setPicked(null);
            }}
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
          {picked === null && query.length > 0 && search.status === 'ready' ? (
            <ResultRows
              results={search.results}
              onPick={(place) => pick({ id: place.place_id, name: place.name })}
            />
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
            label={cta}
            onPress={() => void addToVote()}
            disabled={state.phase === 'streaming'}
            loading={add.pending}
            sheen={!onBoard}
            testID="pitch-add"
          />
        </View>
      )}
    </Sheet>
  );
}
