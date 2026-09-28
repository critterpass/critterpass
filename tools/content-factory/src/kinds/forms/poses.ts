/**
 * Epic poses each archetype actually draws: `sit` has wave/cheer/think, birds and lizards wave and
 * cheer, the hand-drawn guides have the full pose set, and every other archetype uses the two
 * whole-body poses (tilt, hop), which also give their bespoke raised-limb flourish.
 */
import { critters, isGuideSpec, type Pose } from '@cp/critter-art';

const BY_ARCHETYPE: Readonly<Record<string, readonly Pose[]>> = {
  sit: ['wave', 'cheer', 'think'],
  bird: ['wave', 'cheer'],
  lizard: ['wave', 'cheer'],
};
const WHOLE_BODY: readonly Pose[] = ['tilt', 'hop'];
const GUIDE_POSES: readonly Pose[] = ['wave', 'cheer', 'point', 'think'];

export function supportedEpicPoses(critterId: string): readonly Pose[] {
  const critter = critters.find((entry) => entry.id === critterId);
  if (critter === undefined) return [];
  if (isGuideSpec(critter.spec)) return GUIDE_POSES;
  return BY_ARCHETYPE[critter.spec.b] ?? WHOLE_BODY;
}
