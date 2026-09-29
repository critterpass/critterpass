/**
 * Somewhere else (3b-7): the search sheet rises with the keyboard up and results arrive as you
 * type, each with the silhouette of a local that lives there. A country nobody guides yet is
 * headed NO LIVE GUIDE YET with the guest guide's word under the list. Tapping a live-guide place
 * opens its destination page; a guest place opens the guest guide's page. Nothing found offers to
 * ask for the place; offline says search waits for the connection.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { SearchField } from '@/ui/inputs/SearchField';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useDestinationSearch, type PlaceResult } from '../data/use-destination-search';
import { requestPlaceCommand } from '../data/vote-commands';
import { upper } from '../format';
import { voteRoutes } from '../routes';
import { ResultRow } from './result-row';

/** The guest guide who covers places without a live guide. */
const GUEST = GUIDE_STICKERS.tokek;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
}));

/** The one country every result shares when none has a live guide ("MOROCCO"), else null. */
export function unguidedCountry(results: readonly PlaceResult[]): string | null {
  const first = results[0];
  if (first?.country == null) return null;
  const same = results.every(
    (result) => result.coverage === 'guest' && result.country === first.country,
  );
  return same ? first.country : null;
}

export function SearchSheet({ crewId }: { readonly crewId: string | undefined }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const [query, setQuery] = useState('');
  const search = useDestinationSearch(query);
  const request = useCommand(requestPlaceCommand);
  const country = unguidedCountry(search.results);
  const open = (result: PlaceResult) =>
    router.push(
      result.coverage === 'live'
        ? voteRoutes.destination(result.place_id, crewId)
        : voteRoutes.place(result.place_id, crewId),
    );
  const ask = async () => {
    const q = search.query;
    const sent = await request.send({ query: q });
    if (sent.kind === 'rejected') return;
    toast.show({
      id: 'place-requested',
      title: t({ id: 'vote.search.requested', message: `Noted. We'll look into ${q}.` }),
    });
  };
  const empty = search.status === 'ready' && search.results.length === 0;
  return (
    <Sheet
      detents={['large']}
      accessibilityLabel={t({ id: 'vote.search.title', message: 'Search places' })}
      testID="place-search"
    >
      <SheetScrollView keyboardShouldPersistTaps="handled">
        <Stack style={styles.body}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            label={t({ id: 'vote.search.label', message: 'A city or a country' })}
            autoFocus
            testID="place-search-field"
          />
          {country === null ? null : (
            <Stack gap="2" testID="place-search-unguided">
              <Text variant="h2">{upper(country, i18n.locale)}</Text>
              <Text variant="label" color={theme.color.pink}>
                {upper(t({ id: 'vote.search.noGuide', message: 'No live guide yet' }), i18n.locale)}
              </Text>
            </Stack>
          )}
          {search.results.map((result) => (
            <ResultRow key={result.place_id} result={result} onPress={open} />
          ))}
          {country === null ? null : (
            <GuideLine
              guide="tokek"
              name={GUEST.name}
              line={t({
                id: 'vote.search.guestLine',
                message: `Nobody guides ${country} yet, so I'll cover it. The locals still turn up.`,
              })}
              bubble
            />
          )}
          {search.status === 'idle' ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="place-search-idle">
              {t({
                id: 'vote.search.idle',
                message: 'Any city in the world. Guides cover some; a guest covers the rest.',
              })}
            </Text>
          ) : null}
          {search.status === 'offline' ? (
            <Text variant="body" testID="place-search-offline">
              {t({
                id: 'vote.search.offline',
                message: "You're offline. Search comes back with the connection.",
              })}
            </Text>
          ) : null}
          {empty ? (
            <Stack gap="8" testID="place-search-empty">
              <Text variant="body">
                {t({
                  id: 'vote.search.none',
                  message: `Nothing called “${search.query}” yet.`,
                })}
              </Text>
              <PillButton
                label={t({ id: 'vote.search.ask', message: `Ask for ${search.query}` })}
                onPress={() => void ask()}
                loading={request.pending}
                size="sm"
                block={false}
                testID="place-search-ask"
              />
            </Stack>
          ) : null}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
