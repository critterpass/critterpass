import { Circle, Group } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { makeMutable, useFrameCallback, type SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from './shared';

const FALL_SPEED_PT_PER_MS = 0.04;
const DRIFT_AMPLITUDE_PT = 18;
const DRIFT_PERIOD_MS = 3200;

interface Petal {
  readonly key: number;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly driftPhaseMs: SharedValue<number>;
  readonly baseX: number;
}

function makePetal(index: number, width: number, height: number): Petal {
  const baseX = Math.random() * width;
  return {
    key: index,
    x: makeMutable(baseX),
    y: makeMutable(Math.random() * height),
    driftPhaseMs: makeMutable(Math.random() * DRIFT_PERIOD_MS),
    baseX,
  };
}

export interface UsePetalsOptions {
  readonly active: boolean;
  readonly count: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Continuously falling petals (e.g. a themed screen's cherry-blossom backdrop) with a gentle
 * side-to-side drift, wrapping back to the top once they fall past the bottom. Reduced motion:
 * omitted entirely (docs/design-system.md §5, T5 step 5: "omit confetti/rays/petals").
 */
export function usePetals({ active, count, width, height }: UsePetalsOptions): readonly Petal[] {
  const reduced = useReducedImpactMotion();
  const visible = active && !reduced && width > 0 && height > 0;
  const [petals, setPetals] = useState<readonly Petal[]>([]);
  const spawnKey = `${visible}:${count}`;
  const [previousSpawnKey, setPreviousSpawnKey] = useState<string | null>(null);

  // A visibility/count change respawns the whole field structurally — computed once per key change
  // during render (react.dev "Adjusting state when a prop changes"), the same strategy `useOdometer`
  // uses for its column count. width/height are read once per spawn, not tracked live.
  if (previousSpawnKey !== spawnKey) {
    setPreviousSpawnKey(spawnKey);
    setPetals(
      visible
        ? Array.from({ length: count }, (_unused, index) => makePetal(index, width, height))
        : [],
    );
  }

  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    const dtMs = frameInfo.timeSincePreviousFrame ?? 0;
    for (const petal of petals) {
      // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
      petal.y.value += FALL_SPEED_PT_PER_MS * dtMs;
      if (petal.y.value > height) petal.y.value = -10;
      petal.driftPhaseMs.value += dtMs;
      const driftFraction = (petal.driftPhaseMs.value % DRIFT_PERIOD_MS) / DRIFT_PERIOD_MS;
      petal.x.value = petal.baseX + Math.sin(driftFraction * Math.PI * 2) * DRIFT_AMPLITUDE_PT;
    }
  }, false);

  useEffect(() => {
    frameCallback.setActive(visible && petals.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frameCallback's handle identity is not meaningful; only its setActive call matters, read fresh via closure.
  }, [visible, petals.length]);

  return petals;
}

export function PetalField(
  props: UsePetalsOptions & { readonly radius?: number; readonly color?: string },
) {
  const petals = usePetals(props);
  const radius = props.radius ?? 5;
  const color = props.color ?? tokens.color.pink;
  return (
    <Group>
      {petals.map((petal) => (
        <Circle key={petal.key} cx={petal.x} cy={petal.y} r={radius} color={color} />
      ))}
    </Group>
  );
}
