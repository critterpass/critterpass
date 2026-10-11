/**
 * A year later (8.15): the trip's photo full bleed under a wash, "One year ago today" on clear
 * glass, a sun stamp with the place, the time and the date, the title and the moment, the crew's
 * reactions on glass (tap to add yours), then Plan a reunion (the inverted primary on a photo),
 * which pitches the place to the crew's vote, and Share the memory. ✕ goes Home.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { useContext } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { goBackOr } from '@/lib/navigation/back';
import {
  Avatar,
  Button,
  GlassPill,
  LoadingCritter,
  RoundStamp,
  Text,
  TextButton,
  usePremiumReducedMotion,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { useLiveRows } from '../data/live-rows';
import { reactionA11y, reactionLabel } from '../memory/memory-copy';
import type { MemoryReactionChip } from '../memory/memory-model';
import { useMemoryScreen, type MemoryScreenState } from '../memory/use-memory-screen';
import { PremiumMemoryShare, PremiumReactionSheet } from './memory-sheets';
import { RECAP_PAINT } from './recap-paint';

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const MEMORY_TRIP_SQL = 'SELECT trip_id FROM memories WHERE id = ?';

function stampDate(localDate: string | null): string | null {
  if (localDate === null) return null;
  const [y, m, d] = localDate.split('-');
  return y === undefined || m === undefined || d === undefined ? null : `${d}.${m}.${y.slice(2)}`;
}

function Chip({ chip }: { readonly chip: MemoryReactionChip }) {
  const reduced = usePremiumReducedMotion();
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(150) : ZoomIn.springify()}
      style={styles.reaction}
      accessible
      accessibilityLabel={reactionA11y(chip)}
      testID={`memory-reaction-${chip.key}`}
    >
      <Avatar name={chip.name} color={chip.colour ?? RECAP_PAINT.glassOnPhoto} size={24} />
      <Text variant="rowTextStrong" color={RECAP_PAINT.onPhoto}>
        {reactionLabel(chip)}
      </Text>
    </Animated.View>
  );
}

function MemoryScene({ m }: { readonly m: MemoryScreenState }) {
  const insets = useSafeAreaInsets();
  const date = stampDate(m.memory.local_date);
  return (
    <FullScreen
      closeLabel={t({ id: 'recap.link.back', message: 'Home' })}
      onClose={() => goBackOr()}
      testID="memory-screen"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: RECAP_PAINT.dusk }]}>
        {m.photoUrl === null ? null : (
          <Image source={{ uri: m.photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            { experimental_backgroundImage: RECAP_PAINT.memoryWash },
          ]}
        />
      </View>
      <View style={[styles.eyebrow, { top: insets.top + 8 }]} pointerEvents="none">
        <GlassPill label={m.eyebrow} kind="clear" />
      </View>
      <View style={[styles.stamp, { top: insets.top + 96 }]} pointerEvents="none">
        <RoundStamp
          word={(m.place ?? '').toLocaleUpperCase()}
          {...(date === null ? {} : { bottom: date })}
          size={96}
          rotate={12}
        />
      </View>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        <Text variant="hero" color={RECAP_PAINT.onPhoto}>
          {m.title}
        </Text>
        <Text variant="body" color={RECAP_PAINT.onPhotoSoft}>
          {m.body}
        </Text>
        <Pressable
          style={styles.reactions}
          onPress={() => m.setReacting(true)}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'recap.premium.memory.react', message: 'Add your reaction' })}
          testID="memory-react"
        >
          {m.chips.map((chip) => (
            <Chip key={chip.key} chip={chip} />
          ))}
          <View style={styles.reaction}>
            <Text variant="rowTextStrong" color={RECAP_PAINT.onPhoto}>
              {t({ id: 'recap.premium.memory.plus', message: '+ React' })}
            </Text>
          </View>
        </Pressable>
        {m.onReunion === undefined ? null : (
          <Button
            variant="secondary"
            label={t({ id: 'recap.premium.memory.reunion', message: 'Plan a reunion' })}
            onPress={m.onReunion}
            loading={m.reunionPending}
            testID="memory-reunion"
          />
        )}
        <View style={{ alignItems: 'center' }}>
          <TextButton
            label={t({ id: 'recap.premium.memory.share', message: 'Share the memory' })}
            onPress={() => m.setSharing(true)}
            color={RECAP_PAINT.shareOnPhoto}
            testID="memory-share"
          />
        </View>
      </View>
      {m.reacting ? (
        <PremiumReactionSheet
          initial={m.mine}
          onSend={m.onSend}
          onClose={() => m.setReacting(false)}
        />
      ) : null}
      {m.sharing ? (
        <PremiumMemoryShare
          guideKind={m.guideKind}
          eyebrow={m.eyebrow}
          title={m.title}
          body={m.body}
          photoUrl={m.photoUrl}
          signers={m.signers}
          onClose={() => m.setSharing(false)}
        />
      ) : null}
    </FullScreen>
  );
}

function Loading({ loaded }: { readonly loaded: boolean }) {
  return (
    <LoadingCritter
      label={
        loaded
          ? t({ id: 'recap.memory.missing.title', message: 'This memory isn’t here' })
          : t({ id: 'recap.memory.loading', message: 'Loading the memory' })
      }
      testID={loaded ? 'memory-missing' : 'memory-waiting'}
    />
  );
}

function Memory({ memoryId, tripId }: { readonly memoryId: string; readonly tripId: string }) {
  const screen = useMemoryScreen(memoryId, tripId);
  return screen.ready === null ? (
    <Loading loaded={screen.loaded} />
  ) : (
    <MemoryScene m={screen.ready} />
  );
}

function MemoryOfTrip({ memoryId }: { readonly memoryId: string }) {
  const trips = useLiveRows<{ trip_id: string }>(MEMORY_TRIP_SQL, [memoryId], ['memories']);
  const trip = trips.rows[0];
  if (trip === undefined) return <Loading loaded={trips.loaded} />;
  return <Memory memoryId={memoryId} tripId={trip.trip_id} />;
}

export function PremiumMemoryScreen({
  memoryId,
  tripId,
}: {
  readonly memoryId: string;
  readonly tripId: string | null;
}) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <Loading loaded={false} />;
  return tripId === null ? (
    <MemoryOfTrip memoryId={memoryId} />
  ) : (
    <Memory memoryId={memoryId} tripId={tripId} />
  );
}

const styles = StyleSheet.create({
  eyebrow: { position: 'absolute', alignSelf: 'center' },
  stamp: { position: 'absolute', right: 24 },
  foot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, gap: 12 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingStart: 4,
    paddingEnd: 10,
    borderRadius: 16,
    backgroundColor: RECAP_PAINT.glassOnPhoto,
  },
});
