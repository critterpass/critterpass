/**
 * Home's public surface for other features: the vote and trip-turn slots, inbox renderers, nudging, and the
 * widget refresh the signed-in session runs.
 */
export {
  registerHomeNotice,
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
export { nudgeOutcome, useNudge, type NudgeOutcome } from './nudge/use-nudge';
export { shareRelay } from './nudge/share-relay';
export { sendNudgeCommand } from './home-commands';
export { homeRoutes, HOME_ROUTES } from './routes';
export { useWidgetSync } from './widget-gallery/use-widget-sync';
export { useCrewDirectorySync } from './widget-gallery/use-crew-directory-sync';
export { CrewSwitcherMenu } from './premium/crew-switcher/crew-switcher-menu';
