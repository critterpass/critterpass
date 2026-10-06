/**
 * The store screenshot matrix (`devices.json`): which device run a capture comes from and the
 * sizes each store takes. Sizes are checked against the stores' own rules, so a size a store would
 * refuse fails here and not at upload.
 */
import { readFileSync } from 'node:fs';

import { z } from 'zod';

export const CAPTURE_PLATFORMS = ['ios', 'android'] as const;
export type CapturePlatform = (typeof CAPTURE_PLATFORMS)[number];

const targetSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9.-]+$/u),
  store: z.enum(['app-store', 'play']),
  /** The device run whose captures fill this size. */
  capture: z.enum(CAPTURE_PLATFORMS),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type ShotTarget = z.infer<typeof targetSchema>;

const matrixSchema = z.strictObject({
  captures: z.record(
    z.enum(CAPTURE_PLATFORMS),
    z.strictObject({ workflowPlatform: z.enum(CAPTURE_PLATFORMS), statusBar: z.string() }),
  ),
  targets: z.array(targetSchema).min(1),
});

/** Portrait iPhone sizes App Store Connect accepts for the 6.9" and 6.3" display sets. */
const APP_STORE_SIZES: Readonly<Record<string, readonly string[]>> = {
  'iphone-6.9': ['1290x2796', '1320x2868', '1260x2736'],
  'iphone-6.3': ['1179x2556', '1206x2622'],
};

/** Why a store would refuse a screenshot of this size, or undefined when it takes it. */
export function targetIssue(target: ShotTarget): string | undefined {
  const size = `${String(target.width)}x${String(target.height)}`;
  if (target.store === 'app-store') {
    const accepted = APP_STORE_SIZES[target.id];
    if (accepted === undefined) return `${target.id}: not an App Store display set`;
    return accepted.includes(size)
      ? undefined
      : `${target.id}: ${size} is not one of ${accepted.join(', ')}`;
  }
  // Google Play: portrait 9:16, each side 1080 to 3840 px (1080 keeps a phone set promotable).
  if (target.width * 16 !== target.height * 9) return `${target.id}: ${size} is not 9:16`;
  if (target.width < 1080) return `${target.id}: ${size} is narrower than 1080 px`;
  if (target.height > 3840) return `${target.id}: ${size} is taller than 3840 px`;
  return undefined;
}

/** Parses a device matrix; throws with every size a store would refuse. */
export function parseTargets(raw: unknown): ShotTarget[] {
  const { targets } = matrixSchema.parse(raw);
  const issues = targets.map(targetIssue).filter((issue) => issue !== undefined);
  if (new Set(targets.map((target) => `${target.store}/${target.id}`)).size !== targets.length) {
    issues.push('a target is listed twice');
  }
  if (issues.length > 0) throw new Error(`store sizes:\n- ${issues.join('\n- ')}`);
  return targets;
}

export function shotTargets(): ShotTarget[] {
  return parseTargets(
    JSON.parse(readFileSync(new URL('./devices.json', import.meta.url), 'utf8')) as unknown,
  );
}
