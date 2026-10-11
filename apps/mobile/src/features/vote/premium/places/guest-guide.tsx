/**
 * A place's guide page when no live guide covers it (4.03): the photo with clear-glass back and ♥,
 * the content sheet over it with the guide sticker on its edge, the "Guest guide · Tokek" tag, the
 * name, the facts (stops from home, best months, the exchange rate), the guide's notes as they
 * stream in from what it read up on (each with its source), and the dock: Pitch to the crew
 * (picking a crew when the page was not opened from one) and Go solo (4.07).
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { DEFAULT_GUIDE_ID, guideSticker } from '@/ui/avatar/guides';
import { MediaLayer } from '@/ui/media/MediaLayer';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  ListCard,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { useDestinationSlug } from '../../data/use-destination-slug';
import { useMyUid } from '../../data/use-my-uid';
import { useMyCrews, usePlaceSave } from '../../data/use-place-save';
import { useGuestBrief } from '../../places/brief-stream';
import { useCityGuide } from '../../places/guest-guide-page';
import { voteRoutes } from '../../routes';
import { useGuestFacts } from './guest-facts';
import { SoloSheet } from './solo-sheet';

const HERO = 340;
const OVERLAP = 40;

export function GuestGuide({
  placeId,
  crewId,
}: {
  readonly placeId: string;
  readonly crewId: string | undefined;
}) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { state, retry } = useGuestBrief(placeId, crewId);
  const cityGuide = useCityGuide(placeId);
  const guide = guideSticker(cityGuide ?? DEFAULT_GUIDE_ID);
  const photo = heroAt(useDestinationMedia(useDestinationSlug(placeId)).items);
  const me = useMyUid();
  const crews = useMyCrews(me);
  const save = usePlaceSave(placeId, me);
  const [picking, setPicking] = useState(false);
  const [solo, setSolo] = useState(false);
  const place = state.place;
  const pitchTo = (crew: string) => router.push(voteRoutes.pitch(crew, placeId));
  const pitch = () => {
    if (crewId !== undefined) pitchTo(crewId);
    else if (crews.length === 1 && crews[0] !== undefined) pitchTo(crews[0].id);
    else setPicking((open) => !open);
  };
  const facts = useGuestFacts(place);
  const streaming = state.phase === 'loading' || state.phase === 'streaming';
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="guest-page">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <View style={{ height: HERO, overflow: 'hidden', backgroundColor: theme.accent.sun }}>
          <MediaLayer
            media={photo}
            surface="accent"
            accent={theme.accent.sun}
            creditAt="bottom"
            creditInset={OVERLAP + theme.space.gap8}
            dots={false}
            testID="guest-photo"
          />
        </View>
        <View
          style={{
            marginTop: -OVERLAP,
            borderTopLeftRadius: theme.radius.hero,
            borderTopRightRadius: theme.radius.hero,
            backgroundColor: theme.color.ground,
            paddingHorizontal: theme.space.gutter,
            paddingTop: theme.space.gap16 + 6,
            gap: theme.space.gap12,
          }}
        >
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: 18, top: -64 }}
            importantForAccessibility="no-hide-descendants"
          >
            <CritterSticker kind={guide.kind} name={guide.name} size={104} />
          </View>
          {place === null ? (
            state.phase === 'error' ? (
              <View style={{ gap: theme.space.gap8 }} testID="guest-error">
                <Text variant="body">
                  {t({ id: 'vote.guest.error', message: "This place didn't load. Try again?" })}
                </Text>
                <Button
                  label={t({ id: 'vote.guest.retryPlace', message: 'Try again' })}
                  size="small"
                  variant="secondary"
                  onPress={retry}
                  testID="guest-retry"
                />
              </View>
            ) : null
          ) : (
            <>
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingVertical: 5,
                  paddingHorizontal: theme.space.gap10,
                  borderRadius: 9,
                  borderWidth: 2.5,
                  borderColor: theme.accent.stickerEdge,
                  backgroundColor: theme.accent.sun,
                  boxShadow: theme.shadow.sticker,
                  // eslint-disable-next-line lingui/no-unlocalized-strings -- a tilt, never copy.
                  transform: [{ rotate: '-3deg' }],
                }}
              >
                <Text variant="placeTag" color={theme.color.onAccent}>
                  {cityGuide === null
                    ? t({ id: 'vote.premium.guest.tag', message: `Guest guide · ${guide.name}` })
                    : t({ id: 'vote.premium.guest.ownTag', message: `Your guide · ${guide.name}` })}
                </Text>
              </View>
              <View>
                <Text variant="hero" numberOfLines={2} adjustsFontSizeToFit testID="guest-name">
                  {place.name}
                </Text>
                {place.country === null ? null : (
                  <Text variant="rowText" tone="muted">
                    {place.country}
                  </Text>
                )}
              </View>
              {facts.length === 0 ? null : (
                <ListCard>
                  <View style={{ flexDirection: 'row' }} testID="guest-facts">
                    {facts.map((fact, index) => (
                      <View
                        key={fact.key}
                        style={{
                          flex: 1,
                          paddingVertical: theme.space.gap12,
                          paddingHorizontal: theme.space.gap10,
                          borderLeftWidth: index === 0 ? 0 : 0.5,
                          borderColor: theme.color.hairlineMenu,
                        }}
                      >
                        <Text variant="badge" tone="muted">
                          {fact.label}
                        </Text>
                        <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit>
                          {fact.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ListCard>
              )}
              {state.hidden ? null : (
                <View
                  testID="guest-notes"
                  style={{
                    borderRadius: theme.radius.banner,
                    backgroundColor: theme.color.banner.guide.bg,
                    padding: theme.space.gap16,
                    gap: theme.space.gap8,
                    // eslint-disable-next-line lingui/no-unlocalized-strings -- a tilt, never copy.
                    transform: [{ rotate: '-1.2deg' }],
                  }}
                >
                  <Text variant="badge" color={theme.color.guideName}>
                    {t({
                      id: 'vote.premium.guest.notes',
                      message: `${guide.name}’s notes`,
                    }).toLocaleUpperCase()}
                  </Text>
                  {state.facts.map((fact) => (
                    <PressableScale
                      key={fact.url + fact.text}
                      onPress={() => void Linking.openURL(fact.url)}
                      accessibilityRole="link"
                      accessibilityLabel={`${fact.text} (${fact.domain})`}
                    >
                      <Text variant="guide" color={theme.color.banner.guide.text}>
                        {fact.text}
                      </Text>
                      <Text variant="captionMuted" color={theme.color.guideName}>
                        {fact.domain}
                      </Text>
                    </PressableScale>
                  ))}
                  {streaming ? (
                    <Text variant="guide" tone="placeholder">
                      {t({ id: 'vote.premium.guest.reading', message: 'still reading up…' })}
                    </Text>
                  ) : null}
                  {state.phase === 'error' ? (
                    <Button
                      label={t({ id: 'vote.guest.retryPlace', message: 'Try again' })}
                      size="small"
                      variant="secondary"
                      onPress={retry}
                    />
                  ) : null}
                </View>
              )}
              {picking ? (
                <ListCard>
                  {crews.map((crew) => (
                    <PressableScale
                      key={crew.id}
                      onPress={() => pitchTo(crew.id)}
                      accessibilityRole="button"
                      testID={`guest-crew-${crew.id}`}
                      style={{ padding: theme.space.rowPadH }}
                    >
                      <Text variant="rowTitle">{crew.name}</Text>
                    </PressableScale>
                  ))}
                </ListCard>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + theme.space.gap4,
          left: 0,
          right: 0,
          paddingHorizontal: theme.space.gutter,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <GlassIconButton
          icon="back"
          kind="clear"
          label={t({ id: 'vote.guest.back', message: 'Back' })}
          onPress={() => router.back()}
          testID="guest-back"
        />
        <GlassIconButton
          icon="heart"
          kind="clear"
          label={
            save.saved
              ? t({ id: 'vote.guest.saved', message: '♥ Saved' })
              : t({ id: 'vote.premium.guest.save', message: 'Save' })
          }
          onPress={() => void save.toggle()}
          testID="guest-save"
        />
      </View>
      {place === null ? null : (
        <View
          style={{
            position: 'absolute',
            left: theme.space.gap16,
            right: theme.space.gap16,
            bottom: insets.bottom + theme.space.gap12,
            flexDirection: 'row',
            gap: theme.space.gap8,
          }}
        >
          <View style={{ flex: 1.5 }}>
            <Button
              label={t({ id: 'vote.guest.pitch', message: 'Pitch to the crew' })}
              onPress={pitch}
              testID="guest-pitch"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t({ id: 'vote.premium.guest.solo', message: 'Go solo' })}
              variant="secondary"
              onPress={() => setSolo(true)}
              testID="guest-solo"
            />
          </View>
        </View>
      )}
      {solo && place !== null ? (
        <SoloSheet
          placeId={placeId}
          placeName={place.name}
          guide={{ kind: guide.kind, name: guide.name }}
          crewId={crewId}
          onClose={() => setSolo(false)}
        />
      ) : null}
    </View>
  );
}
