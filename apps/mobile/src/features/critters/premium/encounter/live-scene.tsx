/**
 * The live encounter (8.03): the live camera (or a dusk wash where it can't run) full bleed under a
 * darkening fade, the place pill, the tier tag, the critter hopping in its ping ring, its line and
 * why it's shy, and the hold ring. And the empty case: nothing is here any more.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Tag, Text, tierWord, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { artKind } from '../../art-kind';
import {
  backToDay,
  befriendAction,
  formOf,
  holdLabel,
  isHere,
  liveBody,
  nothingHere,
  youreAt,
} from '../../encounter/encounter-copy';
import type { SpawnArt } from '../../encounter/encounter-model';
import { FormArt } from '../components/form-art';
import { HoldRing } from '../components/hold-ring';
import { Hop, Ping } from '../components/loops';
import {
  CLEAR_GLASS,
  ON_PHOTO,
  ON_PHOTO_SOFT,
  PHOTO_SHADE,
  SCRIM,
  SHADE_BLUR,
} from '../components/scrims';
import { tierAccent } from '../components/tier';

const STICKER = 170;

export interface LiveSceneProps {
  readonly art: SpawnArt;
  readonly place: string;
  readonly habitat: string;
  readonly phase: string;
  /** The stay so far, 0–1. */
  readonly progress: number;
  readonly legendary: boolean;
  readonly crewLine: string | null;
  readonly camera: ReactNode;
  readonly onHold: () => void;
  readonly onClose: () => void;
}

/** The photo-like ground every encounter state stands on: the camera over a dusk wash. */
export function EncounterGround({
  camera,
  dim = true,
}: {
  readonly camera?: ReactNode;
  readonly dim?: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: SCRIM.dusk }]} />
      {camera}
      {dim ? (
        <View
          style={[StyleSheet.absoluteFill, { experimental_backgroundImage: SCRIM.encounter }]}
        />
      ) : null}
    </View>
  );
}

export function LiveScene(props: LiveSceneProps) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { art } = props;
  const ready = props.phase === 'ready';
  const tier = tierWord(art.rarity);
  const ring = props.legendary ? theme.accent.sun : theme.accent.mint;
  return (
    <FullScreen
      closeLabel={t({ id: 'critters.premium.encounter.leave', message: 'Leave it for now' })}
      onClose={props.onClose}
      testID={`critters-encounter-${props.phase}`}
    >
      <EncounterGround camera={props.camera} />
      <View style={[styles.placePill, { top: insets.top + 6 }]}>
        <View style={[styles.pill, { backgroundColor: CLEAR_GLASS }]}>
          <View style={[styles.dot, { backgroundColor: theme.accent.mint }]} />
          <Text variant="label" color={ON_PHOTO} numberOfLines={1}>
            {youreAt(props.place)}
          </Text>
        </View>
      </View>
      <View style={[styles.tag, { top: insets.top + 70 }]}>
        <Tag
          label={props.habitat === '' ? `◆ ${tier}` : `◆ ${tier} · ${props.habitat}`}
          color={tierAccent(theme, art.rarity)}
          rotate={-3}
        />
      </View>
      <View style={[styles.stage, { top: insets.top + 158 }]} pointerEvents="none">
        <View style={styles.shadow} />
        <Ping style={[styles.ping, { borderColor: ring }]} />
        <Hop style={styles.sticker}>
          <FormArt
            kind={artKind(art.key)}
            name={art.name ?? ''}
            size={STICKER}
            form={art.form}
            seed={art.seed}
          />
        </Hop>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Text variant="largeTitle" color={ON_PHOTO} accessibilityRole="header">
          {isHere(art.name)}
        </Text>
        <Text variant="body" color={ON_PHOTO_SOFT} style={styles.body}>
          {[liveBody(props.phase, props.legendary), props.crewLine].filter(Boolean).join(' ')}
        </Text>
        <View style={styles.hold}>
          <HoldRing
            label={holdLabel()}
            actionLabel={befriendAction()}
            ready={ready}
            stay={props.progress}
            color={ring}
            onComplete={props.onHold}
            testID="critters-encounter-hold"
          />
        </View>
        <Text variant="caption" color={ON_PHOTO_SOFT} align="center">
          {`${holdLabel()} · ${formOf(art.name, tier, art.formNo, art.formCount)}`}
        </Text>
      </View>
    </FullScreen>
  );
}

export function NothingScene({ onBack }: { readonly onBack: () => void }) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const copy = nothingHere();
  return (
    <FullScreen
      closeLabel={t({ id: 'critters.premium.encounter.close', message: 'Close' })}
      overPhoto={false}
      onClose={onBack}
      testID="critters-encounter-nothing"
    >
      <View
        style={[StyleSheet.absoluteFill, styles.empty, { backgroundColor: theme.color.ground }]}
      >
        <EmptyState
          title={copy.title}
          line={copy.body}
          check={false}
          action={
            <Button
              label={backToDay()}
              variant="secondary"
              onPress={onBack}
              testID="critters-encounter-back"
            />
          }
        />
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  placePill: { position: 'absolute', left: 76, right: 20, alignItems: 'flex-start' },
  pill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tag: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  stage: { position: 'absolute', left: 0, right: 0, height: 230, alignItems: 'center' },
  shadow: {
    position: 'absolute',
    top: 198,
    width: 180,
    height: 30,
    borderRadius: 90,
    backgroundColor: PHOTO_SHADE,
    filter: SHADE_BLUR,
  },
  ping: {
    position: 'absolute',
    top: 128,
    width: 200,
    height: 110,
    borderRadius: 100,
    borderWidth: 2,
  },
  sticker: { width: STICKER, height: STICKER },
  bottom: { position: 'absolute', left: 24, right: 24, bottom: 0 },
  body: { marginTop: 8 },
  hold: { alignItems: 'center', marginTop: 24, marginBottom: 14 },
  empty: { justifyContent: 'center' },
});
