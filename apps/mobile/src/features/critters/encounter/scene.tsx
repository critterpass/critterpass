/**
 * The encounter scene above the card: the live camera inside the viewfinder when it can run,
 * over an illustrated stand-in (the place's striped backdrop) that shows whenever it can't. The critter hops between spots and edges closer as the dwell ring fills; a legendary
 * gets its own layer (drifting petals, swaying lanterns, pulsing sparkles) and a gold ring. When it
 * wandered off, only a dashed ring and its footprints remain.
 */
import type { FormSpec } from '@cp/critter-art';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { patterns, useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Viewfinder } from '@/ui/camera/Viewfinder';
import { WanderFootprints } from '@/ui/critters/WanderFootprints';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { artKind } from '../art-kind';

const RING = 250;
const ART = 170;
const STROKE = 4;

export interface SceneProps {
  readonly mode: string;
  readonly context: string;
  readonly label: string;
  readonly critterKey: string | null;
  readonly seed: number;
  readonly form: FormSpec | null;
  readonly name: string;
  /** 0…1 dwell ring. */
  readonly progress: number;
  readonly legendary: boolean;
  readonly state: 'live' | 'ready' | 'wandered';
  /** The live camera, over the illustrated backdrop when it runs. */
  readonly camera?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  stage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lantern: {
    position: 'absolute',
    top: th.space['32'] * 2,
    width: th.space['20'],
    height: th.space['32'],
    borderRadius: th.radius.md,
    backgroundColor: th.color.yellow,
  },
  sparkle: { position: 'absolute' },
}));

/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands, never copy. */
/** A circle from 12 o'clock, clockwise, so `end` trims the dwell fill. */
function arcPath(size: number): string {
  const r = (size - STROKE) / 2;
  const c = size / 2;
  return `M${c} ${c - r}A${r} ${r} 0 1 1 ${c} ${c + r}A${r} ${r} 0 1 1 ${c} ${c - r}`;
}
/* eslint-enable lingui/no-unlocalized-strings */

function Sparkle({
  x,
  y,
  offset,
}: {
  readonly x: number;
  readonly y: number;
  readonly offset: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const pulse = useLoop('pulse', { offset });
  return (
    <Animated.View style={[styles.sparkle, { start: x, top: y }, pulse]}>
      <Text variant="h2" color={theme.tier.legendary.color}>
        ✦
      </Text>
    </Animated.View>
  );
}

function Lantern({ side }: { readonly side: 'start' | 'end' }) {
  const styles = useStyles();
  const theme = useTheme();
  const sway = useLoop('wiggle', { offset: side === 'start' ? 0 : 0.5 });
  return <Animated.View style={[styles.lantern, { [side]: theme.space['32'] }, sway]} />;
}

function Petals() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const reduced = useReducedImpactMotion();
  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {size.width === 0 || reduced ? null : (
        <Canvas style={StyleSheet.absoluteFill}>
          <patterns.PetalField active count={10} width={size.width} height={size.height} />
        </Canvas>
      )}
    </View>
  );
}

export function EncounterScene(props: SceneProps) {
  const styles = useStyles();
  const theme = useTheme();
  const hop = useLoop('hop', { active: props.state === 'live' });
  const closer = 0.7 + 0.3 * Math.min(1, props.progress);
  const ring = props.legendary ? theme.color.gold.base : theme.semantic.state.success;
  const base = props.legendary ? theme.color.ink['800'] : theme.color.map.parksWater;
  const path = arcPath(RING);
  return (
    <Viewfinder
      mode={props.mode}
      context={props.context}
      pinging={props.state === 'live'}
      accessibilityLabel={props.label}
      testID="critters-encounter-scene"
    >
      <View style={StyleSheet.absoluteFill}>
        <Hatch baseColor={base} />
      </View>
      {props.camera ?? null}
      {props.legendary && props.state !== 'wandered' ? (
        <>
          <Petals />
          <Lantern side="start" />
          <Lantern side="end" />
        </>
      ) : null}
      <View style={styles.stage} pointerEvents="none">
        {props.state === 'wandered' ? (
          <WanderFootprints accessibilityLabel={props.label} />
        ) : (
          <View
            style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={(RING - STROKE) / 2}
                color={ring}
                opacity={0.25}
                style="stroke"
                strokeWidth={STROKE}
              />
              <Path
                path={path}
                color={ring}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="round"
                start={0}
                end={Math.min(1, props.progress)}
              />
            </Canvas>
            {props.critterKey === null ? null : (
              <View style={{ transform: [{ scale: closer }] }}>
                <Animated.View style={hop}>
                  <Sticker
                    kind={artKind(props.critterKey)}
                    name={props.name}
                    size={ART}
                    seed={props.seed}
                    {...(props.form === null ? {} : { form: props.form })}
                  />
                </Animated.View>
              </View>
            )}
            {props.legendary ? (
              <>
                <Sparkle x={theme.space['12']} y={theme.space['32']} offset={0} />
                <Sparkle x={RING - theme.space['32']} y={RING / 2} offset={0.33} />
                <Sparkle
                  x={RING - theme.space['32'] * 2}
                  y={RING - theme.space['32']}
                  offset={0.66}
                />
              </>
            ) : null}
          </View>
        )}
      </View>
    </Viewfinder>
  );
}
