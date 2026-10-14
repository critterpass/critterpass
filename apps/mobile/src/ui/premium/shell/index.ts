// The premium shell: navigators, the screen-type scaffolds (foundations-spec §1), keyboard
// plumbing and the zoom and morph transitions. Premium screens import from here.
export {
  KeyboardAwareScroll,
  KeyboardDismissArea,
  KeyboardFooterScope,
  KeyboardStickyFooter,
  PremiumKeyboardProvider,
  useKeyboardFrame,
} from './keyboard/keyboard';
export type {
  KeyboardAwareScrollProps,
  KeyboardFrame,
  KeyboardStickyFooterProps,
} from './keyboard/keyboard';
export { PremiumStack, PremiumStackScreen } from './navigation/premium-stack';
export type { PremiumStackProps } from './navigation/premium-stack';
export {
  presentationOptions,
  presentedScreenOptions,
  SELF_ANIMATED_SHEET,
  tabSheetOptions,
} from './navigation/presentation-options';
export { leadingControlFor, useScreenPlacement } from './navigation/use-screen-placement';
export { SHEET_TOP_CLEARANCE, useScreenInsets, useShownAsSheet } from './navigation/screen-insets';
export type { LeadingControl } from './navigation/use-screen-placement';
export { GUIDE_TRIGGER_ROUTE, PREMIUM_TABS, PremiumTabs } from './navigation/premium-tabs';
export type { PremiumTabsProps } from './navigation/premium-tabs';
export { useGuideActions } from './navigation/guide-circle';
export type { GuideActions } from './navigation/guide-circle';
export { confirmAlert } from './screens/alerts';
export type { TwoChoiceAlert } from './screens/alerts';
export { askToDiscard, sheetLeaveDecision, useDirtySheetGuard } from './screens/dirty-sheet';
export type { DirtySheetGuard, DiscardPrompt } from './screens/dirty-sheet';
export { FULL_SCREEN_ROUTE_OPTIONS, FullScreen } from './screens/full-screen';
export type { FullScreenProps } from './screens/full-screen';
export type { ShellAction, ToolbarIcon } from './screens/header-actions';
export { HeaderBar, HeaderTitle } from './screens/header-bar';
export type { HeaderBarProps } from './screens/header-bar';
export { FooterStack } from './screens/footer-stack';
export type { FooterStackProps } from './screens/footer-stack';
export { HOLD_TO_CONFIRM_MS, HoldToConfirm } from './screens/hold-to-confirm';
export type { HoldToConfirmProps } from './screens/hold-to-confirm';
export { ModalSheet } from './screens/modal-sheet';
export { useCoverPageSheet, usePageSheetCovered } from './screens/page-sheet-cover';
export type { ModalSheetProps } from './screens/modal-sheet';
export { PushScreen } from './screens/push-screen';
export type { PushScreenProps } from './screens/push-screen';
export { RootScreen } from './screens/root-screen';
export {
  PhotoHeaderScrim,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
} from './screens/scroll-edge';
export type {
  PhotoHeaderScrimProps,
  ScrollEdgeFadeProps,
  ScrollEdges,
} from './screens/scroll-edge';
export type { RootScreenProps, RootScrollBindings, RootScrollProps } from './screens/root-screen';
export {
  SheetScreen,
  sheetDetentOptions,
  sheetMaterialStyle,
  sheetRouteOptions,
} from './screens/sheet-screen';
export type { SheetDetent, SheetScreenProps, SheetVerb } from './screens/sheet-screen';
export { DatabaseWait, SessionDatabaseProvider, SessionGate } from './session-gate';
export type { DatabaseWaitProps, SessionGateProps } from './session-gate';
export { PlusSheetMorph } from './zoom/plus-sheet-morph';
export type { MorphRect, PlusSheetMorphProps } from './zoom/plus-sheet-morph';
export { ZOOM_DESTINATION_OPTIONS, ZoomLink, ZoomTarget } from './zoom/zoom-link';
export type { ZoomLinkProps } from './zoom/zoom-link';
