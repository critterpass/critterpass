export { useSharedClock } from './clock';
export type { DeviceTier } from './device-tier';
export { deviceTier, isLowTier, tierFromTotalMemory } from './device-tier';
export type { PhysicalSpring } from './easing';
export { bezierEasing, isPhysicalSpring, springConfig } from './easing';
export { SOUND_CUE_IDS } from './impact';
export type { SoundCueId } from './impact';
export { feedback, impact, useFeedbackPrefs } from './feedback';
export type { FeedbackPrefsControls, FeedbackPrefsSnapshot } from './feedback';
export { music } from './music';
export type { GuideId, ThemeInfo } from './music';
export type { MotionMode } from './motion-mode';
export { combineMotionMode, useMotionMode } from './motion-mode';
export { OverlayHost } from './overlay/OverlayHost';
export type { FlyToRect, FlyToRequest } from './overlay/fly-to';
export { flyTo, flyToOverlay } from './overlay/fly-to';
export * as patterns from './patterns';
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
