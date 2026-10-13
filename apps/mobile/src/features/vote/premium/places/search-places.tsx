/**
 * Search places (4.02): "Places" as the title, results as you type (the typed part bold, the
 * country and who guides it or how many locals there are to find, a tag for a live guide or a guest
 * guide), the guest guide's note when nobody guides that country yet, and the field docked over
 * the keyboard with its ✕. Search on the keyboard opens the top result; nothing found offers to
 * ask for the place; offline says search comes back with the connection.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Keyboard, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { useGuidesPerCity } from '@/data/guides';
import { regionName } from '@/features/onboarding';
import { toast } from '@/motion';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  GlassSurface,
  GuideNote,
  ListCard,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { KeyboardStickyFooter } from '@/ui/premium/shell';

import { useDestinationSearch, type PlaceResult } from '../../data/use-destination-search';
import { requestPlaceCommand } from '../../data/vote-commands';
import { guideOr } from '../../format';
import { unguidedCountry } from '../../data/use-destination-search';
import { voteRoutes } from '../../routes';

function ResultName({ name, typed }: { readonly name: string; readonly typed: string }) {
  const lead = typed.trim();
  const starts = lead !== '' && name.toLocaleLowerCase().startsWith(lead.toLocaleLowerCase());
  return (
    <Text variant="headline" numberOfLines={1}>
      {starts ? name.slice(0, lead.length) : ''}
      <Text variant="body">{starts ? name.slice(lead.length) : name}</Text>
    </Text>
  );
}

export function SearchPlaces({ crewId }: { readonly crewId: string | undefined }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const [query, setQuery] = useState('');
  const search = useDestinationSearch(query);
  const request = useCommand(requestPlaceCommand);
  const perCity = useGuidesPerCity();
  const country = perCity ? null : unguidedCountry(search.results);
  const open = (result: PlaceResult) => {
    Keyboard.dismiss();
    router.push(
      result.coverage === 'live'
        ? voteRoutes.destination(result.place_id, crewId)
        : voteRoutes.place(result.place_id, crewId),
    );
  };
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
  const guest = guideSticker('tokek');
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="place-search">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingTop: insets.top + theme.space.gap6,
          paddingHorizontal: theme.space.gap16,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <Text
          variant="display"
          accessibilityRole="header"
          style={{ paddingHorizontal: theme.space.gap8 }}
        >
          {t({ id: 'vote.premium.search.title', message: 'Places' })}
        </Text>
        {search.results.length === 0 ? null : (
          <ListCard>
            {search.results.map((result) => {
              const count = result.locals.length;
              const sticker = guideSticker(guideOr(result.guide));
              const guide = sticker.name;
              const where =
                (result.country_code === null
                  ? undefined
                  : regionName(result.country_code, i18n.locale)) ?? result.country;
              const detail =
                result.coverage === 'live'
                  ? t({ id: 'vote.search.liveGuide', message: `${guide} guides here` })
                  : count === 1
                    ? t({ id: 'vote.search.localOne', message: '1 local to find' })
                    : t({ id: 'vote.search.localMany', message: `${count} locals to find` });
              return (
                <PressableScale
                  key={result.place_id}
                  onPress={() => open(result)}
                  accessibilityRole="button"
                  accessibilityLabel={`${result.name}, ${detail}`}
                  testID={`place-result-${result.place_id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space.gap12,
                    paddingVertical: 9,
                    paddingStart: theme.space.gap10,
                    paddingEnd: theme.space.rowPadH,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 15,
                      backgroundColor:
                        result.coverage === 'live'
                          ? theme.color.status.rain.bg
                          : theme.color.banner.guide.bg,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      overflow: 'hidden',
                    }}
                  >
                    <CritterSticker kind={sticker.kind} name={guide} size={44} edge={false} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ResultName name={result.name} typed={query} />
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {where === null ? detail : `${where} · ${detail}`}
                    </Text>
                  </View>
                  <StatusTag
                    tone={result.coverage === 'live' ? 'booked' : 'maybe'}
                    label={
                      result.coverage === 'live'
                        ? t({ id: 'vote.premium.search.live', message: 'Guide live' })
                        : t({ id: 'vote.premium.search.guest', message: 'Guest guide' })
                    }
                  />
                </PressableScale>
              );
            })}
          </ListCard>
        )}
        {country === null ? null : (
          <GuideNote
            name={guest.name}
            critter={guest.kind}
            text={t({
              id: 'vote.search.guestLine',
              message: `Nobody guides ${country} yet, so I'll cover it. The locals still turn up.`,
            })}
            testID="place-search-unguided"
          />
        )}
        {search.status === 'idle' ? (
          <Text variant="body" tone="muted" testID="place-search-idle">
            {perCity
              ? t({
                  id: 'vote.search.idleOwnGuides',
                  message:
                    'Any city in the world. Each has a guide of its own; some are still learning their place.',
                })
              : t({
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
        {search.status === 'failed' ? (
          <Text variant="body" testID="place-search-failed">
            {t({
              id: 'vote.pitch.searchFailed',
              message: "Search didn't answer. Try again in a moment.",
            })}
          </Text>
        ) : null}
        {empty ? (
          <View
            style={{ gap: theme.space.gap8, alignItems: 'flex-start' }}
            testID="place-search-empty"
          >
            <Text variant="body">
              {t({ id: 'vote.search.none', message: `Nothing called “${search.query}” yet.` })}
            </Text>
            <Button
              label={t({ id: 'vote.search.ask', message: `Ask for ${search.query}` })}
              size="small"
              onPress={() => void ask()}
              loading={request.pending}
              testID="place-search-ask"
            />
          </View>
        ) : null}
      </ScrollView>
      <KeyboardStickyFooter openedOffset={theme.space.gap16}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap8,
            paddingHorizontal: theme.space.gap12,
            paddingBottom: Math.max(insets.bottom, theme.space.gap12),
          }}
        >
          <GlassSurface
            kind="regular"
            style={{
              flex: 1,
              height: 50,
              borderRadius: 25,
              justifyContent: 'center',
              paddingHorizontal: theme.space.gap16,
            }}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => {
                const top = search.results[0];
                if (top !== undefined) open(top);
              }}
              placeholder={t({ id: 'vote.search.label', message: 'A city or a country' })}
              placeholderTextColor={theme.color.placeholder}
              selectionColor={theme.color.caret}
              clearButtonMode="while-editing"
              accessibilityLabel={t({ id: 'vote.search.label', message: 'A city or a country' })}
              testID="place-search-field"
              style={[theme.type.field, { color: theme.color.ink, padding: 0 }]}
            />
          </GlassSurface>
          <GlassIconButton
            icon="close"
            label={t({ id: 'vote.premium.close', message: 'Close' })}
            onPress={() => router.back()}
            testID="place-search-close"
          />
        </View>
      </KeyboardStickyFooter>
    </View>
  );
}
