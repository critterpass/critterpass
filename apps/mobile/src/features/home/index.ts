/**
 * Home's public surface for other features: the vote and trip-turn slots, inbox renderers, nudging, and the
 * widget refresh the signed-in session runs.
 */
export {
  registerHomeVoteSlot,
  registerTripTurn,
  useHomeVote,
  useTripTurnView,
  type HomeVoteSlotRegistration,
  type TripTurnNames,
  type TripTurnView,
  type UseTripTurn,
  type VoteSlotProps,
} from './slots';
export {
  registerInboxRenderer,
  type InboxCardCopy,
  type InboxRenderContext,
  type InboxRenderer,
} from './inbox/kind-renderers';
export type { InboxItem } from './inbox/inbox-data';
export { useNudge, type NudgeOutcome } from './nudge/use-nudge';
export { homeRoutes, HOME_ROUTES } from './routes';
export { PostTripCard } from './post-trip-card';
export { useWidgetSync } from './widget-gallery/use-widget-sync';
export { useCrewDirectorySync } from './widget-gallery/use-crew-directory-sync';
export { WidgetGalleryScreen } from './widget-gallery/widget-gallery-screen';
