import { Circle, Group } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { makeMutable, useFrameCallback, type SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import type { DeviceTier } from '../device-tier';
import { useReducedImpactMotion } from './shared';

// docs/design-system.md §3.4 `confetti`: "counts 40/70/90/140; gravity .33, drag .985, life ~1.8s; <=40 on low-end".
export type ConfettiIntensity = 'small' | 'medium' | 'large' | 'huge';
const INTENSITY_COUNTS: Readonly<Record<ConfettiIntensity, number>> = {
  small: 40,
  medium: 70,
  large: 90,
  huge: 140,
};
const LOW_TIER_MAX_PARTICLES = 40;
const GRAVITY_PER_MS = 0.00033; // ".33" scaled from a per-frame (~1ms-normalized) constant
const DRAG_PER_MS = 0.985;
const LIFE_MS = 1800;
const COLORS: readonly string[] = [
  tokens.color.yellow,
  tokens.color.orange,
  tokens.color.pink,
  tokens.color.blue,
  tokens.color.green.base,
];

/** The particle count for `intensity`, capped to the low-tier budget (docs/design-system.md §3.4). */
export function confettiParticleCount(intensity: ConfettiIntensity, tier: DeviceTier): number {
  const requested = INTENSITY_COUNTS[intensity];
  return tier === 'low' ? Math.min(requested, LOW_TIER_MAX_PARTICLES) : requested;
}

interface ConfettiParticle {
  readonly key: number;
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  readonly velocityX: SharedValue<number>;
  readonly velocityY: SharedValue<number>;
  readonly opacity: SharedValue<number>;
  readonly color: string;
  /** `-1` (not yet observed) until the frame loop's own clock (`frameInfo.timestamp`) stamps it on
   * this particle's first tick — spawning happens during render, where reading any clock would be an
   * impure render (react.dev "Components and Hooks must be idempotent"), and `frameInfo.timestamp`
   * uses a different basis than `Date.now()`'s wall-clock epoch, so only the frame loop may set it. */
  readonly bornAtMs: SharedValue<number>;
}

function makeParticle(index: number, originX: number, originY: number): ConfettiParticle {
  const angle = Math.random() * Math.PI * 2;
  const speed = 120 + Math.random() * 180;
  return {
    key: index,
    x: makeMutable(originX),
    y: makeMutable(originY),
    velocityX: makeMutable(Math.cos(angle) * speed),
    velocityY: makeMutable(Math.sin(angle) * speed - 220),
    opacity: makeMutable(1),
    color: COLORS[index % COLORS.length] ?? tokens.color.yellow,
    bornAtMs: makeMutable(-1),
  };
}

export interface UseConfettiOptions {
  readonly active: boolean;
  readonly intensity: ConfettiIntensity;
  readonly tier: DeviceTier;
  readonly originX: number;
  readonly originY: number;
}

/** A burst of Skia confetti particles falling under gravity with drag, fading out over their ~1.8s life. */
export function useConfetti({
  active,
  intensity,
  tier,
  originX,
  originY,
}: UseConfettiOptions): readonly ConfettiParticle[] {
  const reduced = useReducedImpactMotion();
  const [particles, setParticles] = useState<readonly ConfettiParticle[]>([]);
  const burstKey = `${active}:${reduced}:${intensity}:${tier}`;
  const [previousBurstKey, setPreviousBurstKey] = useState<string | null>(null);

  // A fresh burst (or one turning off) is a structural reset, not a value to keep synchronized with
  // an external system every render — computed once per key change during render (react.dev
  // "Adjusting state when a prop changes"), the same strategy `useOdometer` uses for its column count.
  if (previousBurstKey !== burstKey) {
    setPreviousBurstKey(burstKey);
    if (!active || reduced) {
      setParticles([]);
    } else {
      const count = confettiParticleCount(intensity, tier);
      setParticles(
        Array.from({ length: count }, (_unused, index) => makeParticle(index, originX, originY)),
      );
    }
  }

  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    const dtMs = frameInfo.timeSincePreviousFrame ?? 0;
    const now = frameInfo.timestamp;
    for (const particle of particles) {
      // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state.
      if (particle.bornAtMs.value < 0) particle.bornAtMs.value = now;
      particle.velocityY.value += GRAVITY_PER_MS * dtMs * 1000;
      particle.velocityX.value *= Math.pow(DRAG_PER_MS, dtMs / 16);
      particle.velocityY.value *= Math.pow(DRAG_PER_MS, dtMs / 16);
      particle.x.value += (particle.velocityX.value * dtMs) / 1000;
      particle.y.value += (particle.velocityY.value * dtMs) / 1000;
      const age = now - particle.bornAtMs.value;
      particle.opacity.value = Math.max(0, 1 - age / LIFE_MS);
    }
  }, false);

  useEffect(() => {
    frameCallback.setActive(active && !reduced && particles.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frameCallback's handle identity is not meaningful; only its setActive call matters, read fresh via closure.
  }, [active, reduced, particles.length]);

  return particles;
}

export interface ConfettiRequest {
  readonly id: number;
  readonly intensity: ConfettiIntensity;
  readonly tier: DeviceTier;
  readonly originX: number;
  readonly originY: number;
}

type ConfettiListener = (requests: readonly ConfettiRequest[]) => void;
const confettiListeners = new Set<ConfettiListener>();
let confettiRequests: readonly ConfettiRequest[] = [];
let nextConfettiId = 0;

function notifyConfetti(): void {
  confettiListeners.forEach((listener) => listener(confettiRequests));
}

/** `OverlayHost` subscribes and renders one `ConfettiBurst` per active request inside its Canvas. */
export const confettiOverlay = {
  subscribe(listener: ConfettiListener): () => void {
    confettiListeners.add(listener);
    return () => confettiListeners.delete(listener);
  },
  get requests(): readonly ConfettiRequest[] {
    return confettiRequests;
  },
  dismiss(id: number): void {
    confettiRequests = confettiRequests.filter((request) => request.id !== id);
    notifyConfetti();
  },
};

/** Queues a confetti burst for `OverlayHost` to render (docs/design-system.md §3.4 `confetti`). */
export function triggerConfetti(
  originX: number,
  originY: number,
  intensity: ConfettiIntensity,
  tier: DeviceTier,
): void {
  const id = nextConfettiId;
  nextConfettiId += 1;
  confettiRequests = [...confettiRequests, { id, intensity, tier, originX, originY }];
  notifyConfetti();
}

export interface ConfettiBurstProps extends UseConfettiOptions {
  readonly radius?: number;
}

/** Renders a `useConfetti` burst as Skia circles; mount inside `OverlayHost`'s Canvas. */
export function ConfettiBurst(props: ConfettiBurstProps) {
  const particles = useConfetti(props);
  const radius = props.radius ?? 4;
  return (
    <Group>
      {particles.map((particle) => (
        <Circle
          key={particle.key}
          cx={particle.x}
          cy={particle.y}
          r={radius}
          color={particle.color}
          opacity={particle.opacity}
        />
      ))}
    </Group>
  );
}
