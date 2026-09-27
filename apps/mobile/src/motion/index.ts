export { useSharedClock } from './clock';
export type { DeviceTier } from './device-tier';
export { deviceTier, isLowTier, tierFromTotalMemory } from './device-tier';
export type { PhysicalSpring } from './easing';
export { bezierEasing, isPhysicalSpring, springConfig } from './easing';
export { impact, SOUND_CUE_IDS } from './impact';
export type { SoundCueId } from './impact';
export type { MotionMode } from './motion-mode';
export { combineMotionMode, useMotionMode } from './motion-mode';
export type {
  LoopEasingId,
  LoopKeyframeStop,
  LoopPresetDef,
  LoopPresetId,
  LoopTransform,
} from './presets';
export { LOOP_PRESET_IDS, LOOP_PRESETS, restingLoopTransform, sampleLoopPreset } from './presets';
export type { SlowmoMultiplier } from './slowmo';
export { motionFreeze, setMotionFreeze, setSlowmoMultiplier, slowmoMultiplier } from './slowmo';
export type { UseLoopOptions } from './use-loop';
export { useLoop } from './use-loop';
