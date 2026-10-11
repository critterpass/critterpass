/**
 * Home just after a trip (3.04): the place's photo fading into the ground, "Home 3 days · Oct 22"
 * and "Bali is a memory now" over the fade, then the things left to do (settle up, the recap) and
 * "Same crew, next trip?". Kept inside the scroll under the large title, so the root screen keeps
 * its one header.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients, never copy. */
import type { HomeTripInput } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import {
  Button,
  CritterSticker,
  Icon,
  ListCard,
  Row,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { TripPhoto } from './trip-photo';

const useStyles = makePremiumStyles((t) => ({
  hero: {
    height: 300,
    borderRadius: t.radius.hero,
    overflow: 'hidden',
    backgroundColor: t.color.control,
  },
  fade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  words: {
    position: 'absolute',
    left: t.space.gutter,
    right: t.space.gutter,
    bottom: t.space.gutter,
    gap: 4,
  },
  eyebrow: { letterSpacing: 1.3, textTransform: 'uppercase', fontWeight: '700' },
  title: { fontWeight: '800', letterSpacing: -1.36, lineHeight: 34.7 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  next: {
    height: 120,
    borderRadius: 26,
    padding: t.space.gutter,
    paddingEnd: 100,
    gap: 4,
    justifyContent: 'center',
    backgroundImage: 'linear-gradient(135deg, #fff1e6, #ffe4f0)',
  },
  nextTitle: { fontWeight: '700' },
  nextSticker: { position: 'absolute', end: -4, top: -6, transform: [{ rotate: '10deg' }] },
  nextButton: { alignSelf: 'flex-start', marginTop: 6 },
}));

export interface BackHeroProps {
  readonly trip: HomeTripInput;
  /** Whole days since the last day. */
  readonly daysHome: number;
  readonly onRecap?: () => void;
  readonly onSettle: () => void;
  readonly onNext?: () => void;
}

export function BackHero({ trip, daysHome, onRecap, onSettle, onNext }: BackHeroProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const place = trip.destinationName ?? t({ id: 'home.postTrip.fallback', message: 'Trip' });
  return (
    <View style={{ gap: theme.space.gap16 }} testID="home-post-trip">
      <View style={styles.hero}>
        <TripPhoto slug={trip.destinationSlug ?? null} />
        <View
          style={[
            styles.fade,
            {
              backgroundImage: `linear-gradient(180deg, rgba(10,12,20,.35) 0%, rgba(10,12,20,0) 30%, rgba(10,12,20,0) 50%, ${theme.color.ground} 100%)`,
            },
          ]}
        />
        <View style={styles.words}>
          <Text variant="label" style={styles.eyebrow}>
            {t({ id: 'home.premium.back.eyebrow', message: `Home ${daysHome} days` })}
          </Text>
          <Text variant="display" accessibilityRole="header" style={styles.title}>
            {t({ id: 'home.premium.back.title', message: `${place} is a memory now` })}
          </Text>
        </View>
      </View>
      <ListCard radius={theme.radius.cardRow}>
        <Row
          title={t({ id: 'home.premium.back.settle', message: 'Settle up with the crew' })}
          subtitle={t({ id: 'home.premium.back.settleSub', message: 'Before the recap locks' })}
          leading={
            <View style={[styles.tile, { backgroundColor: theme.color.status.voteOpen.bg }]}>
              <Icon name="wallet" size={20} color={theme.color.status.voteOpen.text} />
            </View>
          }
          onPress={onSettle}
          testID="home-back-settle"
        />
        {onRecap === undefined ? null : (
          <Row
            title={t({ id: 'home.postTrip.open', message: 'See the recap' })}
            subtitle={t({ id: 'home.premium.back.recapSub', message: 'Day 1 to the flight home' })}
            leading={
              <View style={[styles.tile, { backgroundColor: theme.color.banner.guide.bg }]}>
                <CritterSticker kind="gecko" name="Tokek" size={30} pose="cheer" />
              </View>
            }
            onPress={onRecap}
            testID="home-back-recap"
          />
        )}
      </ListCard>
      {onNext === undefined ? null : (
        <View style={styles.next}>
          <View style={styles.nextSticker} pointerEvents="none">
            <CritterSticker kind="tanuki" name="Pon" size={86} pose="wave" />
          </View>
          <Text variant="navTitle" style={styles.nextTitle}>
            {t({ id: 'home.premium.back.nextTitle', message: 'Same crew, next trip?' })}
          </Text>
          <Text variant="note" tone="inkSecondary">
            {t({ id: 'home.premium.back.nextBody', message: 'Pitch a place and the vote starts.' })}
          </Text>
          <View style={styles.nextButton}>
            <Button
              label={t({ id: 'home.premium.back.nextCta', message: 'Plan the next one' })}
              size="small"
              onPress={onNext}
              testID="home-back-next"
            />
          </View>
        </View>
      )}
    </View>
  );
}
