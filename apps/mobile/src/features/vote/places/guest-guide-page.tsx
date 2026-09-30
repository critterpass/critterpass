/**
 * A place no live guide covers (3b-8): the guest guide hops onto the hero the way a live guide
 * would, with the facts code knows (stops from home, the exchange rate, the best months), the
 * locals as breathing silhouettes, and what the guest guide read up on from allow-listed sources.
 * SAVE flaps to SAVED; PITCH TO THE CREW opens the pitch for the crew (picking one when the page
 * was not opened from a crew); SOLO TRIP confirms a trip for one. While the confirm or the crew
 * picker is open, back (the page's own control or Android's) returns to the actions, not off the page.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { patterns, useLoop } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { GuideLine } from '@/ui/people/GuideLine';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useMyUid } from '../data/use-my-uid';
import { useMyCrews, usePlaceSave } from '../data/use-place-save';
import { monthShort, upper } from '../format';
import { voteRoutes } from '../routes';
import { BriefFacts, useGuestBrief, type GuestPlace } from './brief-stream';
import { CrewPicker } from './crew-picker';
import { LocalsStrip } from './locals-strip';
import { SoloConfirm } from './solo-confirm';

const GUEST = GUIDE_STICKERS.tokek;

/** Smallest size the hero name shrinks to (a 13-letter city on a 360 pt phone). */
const HERO_NAME_FLOOR = 40;

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, backgroundColor: th.semantic.bg.base },
  body: { paddingHorizontal: th.space['20'], gap: th.space['20'] },
  hero: {
    backgroundColor: th.color.yellow,
    borderRadius: th.radius.cardBig,
    padding: th.space['20'],
    gap: th.space['8'],
  },
}));

/** "10 MAD ≈ $1" when the place's money is worth less than the home currency, else "1 EUR ≈ $1.08". */
export function fxLine(locale: string, fx: NonNullable<GuestPlace['fx']>): string | null {
  if (!(fx.rate > 0)) return null;
  const home = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: fx.quote,
      minimumFractionDigits: Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  if (fx.rate >= 1) return `1 ${fx.base} ≈ ${home(fx.rate)}`;
  const units = Math.round(1 / fx.rate);
  return `${units.toLocaleString(locale)} ${fx.base} ≈ ${home(units * fx.rate)}`;
}

function Facts({ place }: { readonly place: GuestPlace }) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const chips: string[] = [];
  if (place.stops !== null) {
    chips.push(
      place.stops === 0
        ? t({ id: 'vote.guest.direct', message: 'Direct from home' })
        : place.stops === 1
          ? t({ id: 'vote.guest.oneStop', message: '1 stop from home' })
          : t({ id: 'vote.guest.stops', message: `${place.stops} stops from home` }),
    );
  }
  const fx = place.fx === null ? null : fxLine(locale, place.fx);
  if (fx !== null) chips.push(fx);
  if (place.bestMonths.length > 0) {
    const months = place.bestMonths.map((m) => monthShort(locale, m)).join(' · ');
    chips.push(t({ id: 'vote.guest.best', message: `Best: ${months}` }));
  }
  if (chips.length === 0) return null;
  return (
    <Row gap="6" wrap testID="guest-facts">
      {chips.map((chip) => (
        <InfoPill key={chip} variant="outline">
          {upper(chip, locale)}
        </InfoPill>
      ))}
    </Row>
  );
}

function SaveFlap({ placeId }: { readonly placeId: string }) {
  const { t, i18n } = useLingui();
  const { saved, toggle } = usePlaceSave(placeId, useMyUid());
  const flap = patterns.useFlap({ value: saved });
  const label = flap.displayValue
    ? t({ id: 'vote.guest.saved', message: '♥ Saved' })
    : t({ id: 'vote.guest.save', message: '♡ Save' });
  return (
    <Animated.View style={flap.style}>
      <InlineAction
        kind="choice"
        selected={saved}
        label={upper(label, i18n.locale)}
        onPress={() => void toggle()}
        testID="guest-save"
      />
    </Animated.View>
  );
}

export function GuestGuidePage({
  placeId,
  crewId,
}: {
  readonly placeId: string;
  readonly crewId: string | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const { state, retry } = useGuestBrief(placeId, crewId);
  const crews = useMyCrews(useMyUid());
  const hop = useLoop('hop');
  const [mode, setMode] = useState<'actions' | 'crews' | 'solo'>('actions');
  // The "← COUNTRY" eyebrow is always drawn, so the page always has its way back.
  useBackAffordance();
  const place = state.place;
  const pitchTo = (crew: string) => router.push(voteRoutes.pitch(crew, placeId));
  const pitch = () => {
    if (crewId !== undefined) pitchTo(crewId);
    else if (crews.length === 1 && crews[0] !== undefined) pitchTo(crews[0].id);
    else setMode('crews');
  };
  const back = () => {
    if (mode === 'actions') router.back();
    else setMode('actions');
  };
  useEffect(() => {
    if (mode === 'actions') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMode('actions');
      return true;
    });
    return () => subscription.remove();
  }, [mode]);
  return (
    <View style={styles.screen} testID="guest-page">
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + theme.space['8'], paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Row justify="space-between" align="center">
          <InlineAction
            kind="choice"
            label={upper(
              `← ${place?.country ?? t({ id: 'vote.guest.back', message: 'Back' })}`,
              i18n.locale,
            )}
            onPress={back}
            testID="guest-back"
          />
          <SaveFlap placeId={placeId} />
        </Row>
        {place === null ? (
          state.phase === 'error' ? (
            <Stack gap="8" testID="guest-error">
              <Text variant="body">
                {t({ id: 'vote.guest.error', message: "This place didn't load. Try again?" })}
              </Text>
              <PillButton
                label={t({ id: 'vote.guest.retryPlace', message: 'Try again' })}
                onPress={retry}
                size="sm"
                block={false}
                testID="guest-retry"
              />
            </Stack>
          ) : null
        ) : (
          <>
            <View style={styles.hero}>
              <Animated.View style={[{ alignSelf: 'flex-end' }, hop]}>
                <LiveSticker kind={GUEST.kind} name={GUEST.name} size={88} drawOn={false} />
              </Animated.View>
              {/* One line per word, and a floor low enough that a long single-word city
                  ("CHEFCHAOUEN") shrinks to fit instead of breaking mid-word or cutting off. */}
              <Text
                variant="displayMega"
                autoFit
                autoFitMinSize={HERO_NAME_FLOOR}
                numberOfLines={Math.min(3, place.name.trim().split(/\s+/u).length)}
                color={theme.semantic.text.onAccent}
                testID="guest-name"
              >
                {upper(place.name, i18n.locale)}
              </Text>
              <Text variant="label" color={theme.semantic.text.onAccent}>
                {upper(
                  t({ id: 'vote.guest.guestGuide', message: `Guest guide: ${GUEST.name}` }),
                  i18n.locale,
                )}
              </Text>
              <GuideLine
                guide="tokek"
                name={GUEST.name}
                line={t({
                  id: 'vote.guest.line',
                  message: "Not my island, but I've done my homework.",
                })}
                bubble
              />
            </View>
            <Facts place={place} />
            <LocalsStrip locals={place.locals} />
            <BriefFacts state={state} guideName={GUEST.name} onRetry={retry} />
            {mode === 'solo' ? (
              <SoloConfirm
                placeId={placeId}
                placeName={place.name}
                guideName={GUEST.name}
                crewId={crewId}
                onCancel={() => setMode('actions')}
              />
            ) : (
              <Stack gap="10">
                {mode === 'crews' ? <CrewPicker crews={crews} onPick={pitchTo} /> : null}
                <PillButton
                  label={t({ id: 'vote.guest.pitch', message: 'Pitch to the crew' })}
                  onPress={pitch}
                  disabled={mode === 'crews'}
                  testID="guest-pitch"
                />
                <PillButton
                  label={t({ id: 'vote.guest.solo', message: 'Solo trip' })}
                  variant="secondary"
                  onPress={() => setMode('solo')}
                  testID="guest-solo"
                />
              </Stack>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
