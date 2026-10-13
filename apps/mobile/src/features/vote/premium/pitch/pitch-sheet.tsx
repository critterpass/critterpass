/**
 * Pitch a place, in the premium look (undesigned; a native sheet built from the kit): the place
 * search on top, the matches as rows while typing, the picked place's pitch streaming in, other
 * places to try, and "Add" in the header once the pitch has landed. A place already on the board
 * says so and leads back to it.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  CritterSticker,
  Icon,
  ListCard,
  Row,
  Skeleton,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { PitchSheetProps } from '../../board/use-pitch-sheet';
import { usePitchSheet } from '../../board/use-pitch-sheet';
import { money } from '../../format';
import { PremiumPitchCard } from './pitch-card';

export function PremiumPitchSheet({ crewId, placeId }: PitchSheetProps) {
  const { t, i18n } = useLingui();
  const theme = usePremiumTheme();
  const sheet = usePitchSheet({
    crewId,
    placeId,
    sticker: (guide) => <CritterSticker kind={guide.kind} name={guide.name} size={44} />,
  });
  const { search, state, picked, searching } = sheet;
  const asked = search.query;
  const quiet = (text: string, testID: string) => (
    <Text variant="body" tone="muted" testID={testID}>
      {text}
    </Text>
  );
  return (
    <SheetScreen
      title={t({ id: 'vote.pitch.title', message: 'Pitch a place' })}
      cancelLabel={t({ id: 'vote.premium.cancel', message: 'Cancel' })}
      {...(picked === null
        ? {}
        : {
            verb: {
              label: sheet.onBoard
                ? t({ id: 'vote.premium.pitch.back', message: 'Done' })
                : t({ id: 'vote.premium.pitch.add', message: 'Add' }),
              onPress: async () => {
                await sheet.addToVote();
                return false;
              },
              disabled: state.phase === 'streaming' || sheet.adding,
              testID: 'pitch-add',
            },
          })}
      testID="pitch-sheet"
    >
      <View style={[styles.body, { paddingHorizontal: theme.space.gutter }]}>
        <TextField
          value={sheet.query}
          onChangeText={sheet.setQuery}
          placeholder={t({ id: 'vote.pitch.search', message: 'Search a place' })}
          accessibilityLabel={t({ id: 'vote.pitch.search', message: 'Search a place' })}
          autoFocus={placeId === undefined}
          returnKeyType="search"
          clearButtonMode="while-editing"
          testID="pitch-search"
        />
        {searching && search.results.length > 0 ? (
          <ListCard testID="pitch-results">
            {search.results.map((result, index) => (
              <Row
                key={result.place_id}
                title={result.name}
                {...(result.country === null ? {} : { subtitle: result.country })}
                leading={<Icon name="pin" size={20} color={theme.color.inkSecondary} />}
                onPress={() => sheet.pick({ id: result.place_id, name: result.name })}
                testID={`pitch-result-${index}`}
              />
            ))}
          </ListCard>
        ) : null}
        {searching && search.status === 'loading' && search.results.length === 0 ? (
          <View
            style={styles.loading}
            accessibilityLabel={t({ id: 'vote.pitch.searching', message: 'Searching places' })}
            testID="pitch-searching"
          >
            <Skeleton height={50} radius={theme.radius.cardRow} tone="block" />
            <Skeleton height={50} radius={theme.radius.cardRow} tone="block" />
          </View>
        ) : null}
        {searching && search.status === 'ready' && search.results.length === 0
          ? quiet(
              t({
                id: 'vote.pitch.none',
                message: `Nothing called “${asked}”. Check the spelling, or try the country.`,
              }),
              'pitch-no-results',
            )
          : null}
        {picked === null && search.status === 'failed'
          ? quiet(
              t({
                id: 'vote.pitch.searchFailed',
                message: "Search didn't answer. Try again in a moment.",
              }),
              'pitch-search-failed',
            )
          : null}
        {picked === null && search.status === 'offline'
          ? quiet(
              t({
                id: 'vote.pitch.offline',
                message: "You're offline. Search comes back with the connection.",
              }),
              'pitch-offline',
            )
          : null}
        {picked === null ? null : (
          <PremiumPitchCard state={state} people={sheet.people} onRetry={sheet.retry} />
        )}
        {state.alternatives.length > 0 ? (
          <View style={styles.alternatives} testID="pitch-alternatives">
            <Text variant="label" tone="muted">
              {t({ id: 'vote.pitch.orTry', message: 'Or try' })}
            </Text>
            <View style={styles.wrap}>
              {state.alternatives.map((alternative) => (
                <Button
                  key={alternative.place_id}
                  variant="control"
                  size="small"
                  label={
                    alternative.kind === 'cheaper' &&
                    alternative.delta_minor !== null &&
                    alternative.currency !== null
                      ? t({
                          id: 'vote.pitch.cheaper',
                          message: `${alternative.name} · ${money(i18n.locale, alternative.delta_minor, alternative.currency)} less`,
                        })
                      : t({ id: 'vote.pitch.nearby', message: `${alternative.name} · nearby` })
                  }
                  onPress={() => sheet.pick({ id: alternative.place_id, name: alternative.name })}
                  testID={`pitch-alternative-${alternative.place_id}`}
                />
              ))}
            </View>
          </View>
        ) : null}
        {sheet.onBoard
          ? quiet(
              t({ id: 'vote.pitch.onBoard', message: 'Already on the board' }),
              'pitch-on-board',
            )
          : null}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: 8, paddingBottom: 24 },
  loading: { gap: 8 },
  alternatives: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
