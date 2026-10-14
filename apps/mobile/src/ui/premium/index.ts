// The premium kit (docs/design-system-premium.md). Premium screens import from here; the legacy kit
// (`@/ui/*` outside `premium`, `@/motion`) is never mixed in.
export { Button, buttonLook } from './buttons/Button';
export { HeaderPill } from './buttons/HeaderPill';
export type { HeaderPillProps } from './buttons/HeaderPill';
export type { ButtonProps, ButtonSize, ButtonVariant } from './buttons/Button';
export { IconButton } from './buttons/IconButton';
export type { IconButtonProps, IconButtonTone } from './buttons/IconButton';
export { PasteButton } from './buttons/PasteButton';
export type { PasteButtonProps } from './buttons/PasteButton';
export { TextButton, TextButtonAlignProvider } from './buttons/TextButton';
export type { TextButtonAlign, TextButtonProps } from './buttons/TextButton';
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
export { burstPieces, Confetti } from './motion/Confetti';
export type { ConfettiPiece, ConfettiProps } from './motion/Confetti';
export { CrossFade } from './motion/CrossFade';
export type { CrossFadeProps } from './motion/CrossFade';
export { NumberRoll, rollSlots } from './motion/NumberRoll';
export type { NumberRollProps, RollSlot } from './motion/NumberRoll';
export { StampMoment } from './motion/StampMoment';
export type { StampMomentProps } from './motion/StampMoment';
export { popIn, riseIn } from './motion/entrances';
export { SwipeDeck } from './motion/SwipeDeck';
export type { SwipeDeckHandle, SwipeDeckProps } from './motion/SwipeDeck';
export { swipeVerdict } from './motion/swipe-verdict';
export type { SwipeVote } from './motion/swipe-verdict';
export {
  enterTransition,
  exitTransition,
  layoutTransition,
  REDUCED_FADE,
  REDUCED_FADE_MS,
  reducedFadeIn,
  reducedFadeOut,
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
export { kitType } from './theme/kit-type';
export type { PremiumTypeName } from './theme/kit-type';
export type { PremiumTheme } from './theme/theme';
export { Checkbox } from './controls/Checkbox';
export { Chip, chipLook } from './controls/Chip';
export type { ChipProps, ChipSize, ChipSurface } from './controls/Chip';
export type { CheckboxProps } from './controls/Checkbox';
export { Composer } from './controls/Composer';
export type { ComposerIdleAction, ComposerProps } from './controls/Composer';
export { progressFraction, segmentFrames, stepperCan, stepValue } from './controls/control-logic';
export type { SegmentFrame, StepperBounds } from './controls/control-logic';
export { ProgressBar, StepProgress } from './controls/Progress';
export type { ProgressBarProps, StepProgressProps } from './controls/Progress';
export { SegmentedControl } from './controls/SegmentedControl';
export type { SegmentedControlProps, SegmentOption } from './controls/SegmentedControl';
export { Stepper } from './controls/Stepper';
export type { StepperProps } from './controls/Stepper';
export { SearchField } from './controls/SearchField';
export type { SearchFieldProps } from './controls/SearchField';
export { TextField } from './controls/TextField';
export type { TextFieldProps } from './controls/TextField';
export { Toggle } from './controls/Toggle';
export type { ToggleProps } from './controls/Toggle';
export { WizardStepper } from './controls/WizardStepper';
export type { WizardStepperProps } from './controls/WizardStepper';
export { ring } from './theme/theme';
export { Card, ListCard } from './cards/Card';
export type { CardProps, ListCardProps } from './cards/Card';
export { GuideNote } from './cards/GuideNote';
export type { GuideNoteProps, GuideTint } from './cards/GuideNote';
export { DayBadge, Row } from './cards/Row';
export type { DayBadgeProps, RowProps } from './cards/Row';
export { ROW_ROOM_ABOVE, ROW_ROOM_BELOW, ScrollRow } from './cards/ScrollRow';
export type { ScrollRowProps } from './cards/ScrollRow';
export { PhotoCard, StatTile } from './cards/StatTile';
export type { PhotoCardProps, StatTileProps } from './cards/StatTile';
export { StatusTag } from './cards/StatusTag';
export type { StatusTagProps, StatusTone } from './cards/StatusTag';
export { Avatar, avatarFill, CrewStack, initialOf } from './people/Avatar';
export type { AvatarFill, AvatarProps, CrewMember, CrewStackProps } from './people/Avatar';
export { CritterSticker } from './stickers/CritterSticker';
export { StickerIcon } from './stickers/StickerIcon';
export type { StickerIconName, StickerIconProps } from './stickers/StickerIcon';
export type { CritterStickerProps } from './stickers/CritterSticker';
export { RectStamp, RoundStamp } from './stickers/Stamp';
export type { RectStampProps, RoundStampProps, StampInk } from './stickers/Stamp';
export { EmptySlot, Tag } from './stickers/Tag';
export type { EmptySlotProps, TagProps } from './stickers/Tag';
export { TierLabel, tierWord } from './stickers/TierLabel';
export type { CritterTier, TierLabelProps } from './stickers/TierLabel';
export { Banner, OfflinePill } from './feedback/Banner';
export type { BannerProps, BannerTone, OfflinePillProps } from './feedback/Banner';
export { Toast, toastText } from './feedback/Toast';
export type { ToastProps, ToastSpec } from './feedback/Toast';
export { ToastHost, useToast } from './feedback/ToastHost';
export { ExternalToasts } from './feedback/external-toasts';
export type { ExternalToast, ExternalToastSource } from './feedback/external-toasts';
export type { ToastHostProps, UseToastOptions } from './feedback/ToastHost';
export { EmptyState } from './states/EmptyState';
export type { EmptyStateProps } from './states/EmptyState';
export { LoadingCritter, Skeleton } from './states/Skeleton';
export { PremiumSessionWaiting } from './states/SessionWaiting';
export { PhotoViewer } from './media/photo-viewer';
export { PHOTO_VIEWER_PAINT } from './media/photo-viewer-paint';
export type { PhotoViewerProps } from './media/photo-viewer';
export { PhotoLayer } from './media/photo-layer';
export type { PhotoLayerProps } from './media/photo-layer';
export type { LoadingCritterProps, SkeletonProps } from './states/Skeleton';
