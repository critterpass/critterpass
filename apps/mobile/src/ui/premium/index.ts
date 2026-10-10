// The premium kit (docs/design-system-premium.md). Premium screens import from here; the legacy kit
// (`@/ui/*` outside `premium`, `@/motion`) is never mixed in.
export { Button, buttonLook } from './buttons/Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './buttons/Button';
export { IconButton } from './buttons/IconButton';
export type { IconButtonProps, IconButtonTone } from './buttons/IconButton';
export { TextButton } from './buttons/TextButton';
export type { TextButtonProps } from './buttons/TextButton';
export { Spinner } from './feedback/Spinner';
export { GlassIconButton } from './glass/GlassIconButton';
export type { GlassIconButtonProps } from './glass/GlassIconButton';
export { GlassPill } from './glass/GlassPill';
export type { GlassPillProps } from './glass/GlassPill';
export { GlassSurface } from './glass/GlassSurface';
export type { GlassKind, GlassSurfaceProps } from './glass/GlassSurface';
export { Icon } from './icons/Icon';
export type { IconProps, PremiumIconName } from './icons/Icon';
export { hitSlopFor, PressableScale } from './motion/PressableScale';
export type { PressableScaleProps } from './motion/PressableScale';
export { usePremiumReducedMotion } from './motion/reduced-motion';
export {
  enterTransition,
  exitTransition,
  layoutTransition,
  REDUCED_FADE,
  REDUCED_FADE_MS,
  SPRINGS,
} from './motion/springs';
export { Text } from './text/Text';
export type { PremiumTextProps, PremiumTextTone } from './text/Text';
export {
  APPEARANCES,
  readAppearance,
  resolveScheme,
  setAppearance,
  useAppearance,
} from './theme/appearance';
export type { Appearance } from './theme/appearance';
export {
  makePremiumStyles,
  PremiumThemeProvider,
  usePremiumTheme,
} from './theme/PremiumThemeProvider';
export type { PremiumThemeProviderProps } from './theme/PremiumThemeProvider';
export { PREMIUM_THEMES } from './theme/theme';
export type { PremiumTheme } from './theme/theme';
export { Checkbox } from './controls/Checkbox';
export type { CheckboxProps } from './controls/Checkbox';
export { Composer } from './controls/Composer';
export type { ComposerProps } from './controls/Composer';
export { progressFraction, segmentFrames, stepperCan, stepValue } from './controls/control-logic';
export type { SegmentFrame, StepperBounds } from './controls/control-logic';
export { ProgressBar, StepProgress } from './controls/Progress';
export type { ProgressBarProps, StepProgressProps } from './controls/Progress';
export { SegmentedControl } from './controls/SegmentedControl';
export type { SegmentedControlProps, SegmentOption } from './controls/SegmentedControl';
export { Stepper } from './controls/Stepper';
export type { StepperProps } from './controls/Stepper';
export { TextField } from './controls/TextField';
export type { TextFieldProps } from './controls/TextField';
export { Toggle } from './controls/Toggle';
export type { ToggleProps } from './controls/Toggle';
export { WizardStepper } from './controls/WizardStepper';
export type { WizardStepperProps } from './controls/WizardStepper';
export { ring } from './theme/theme';
