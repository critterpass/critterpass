/**
 * Home's public surface for other features: the vote slot, inbox renderers, nudging, and the
 * widget refresh the signed-in session runs.
 */
export {
  registerHomeVoteSlot,
  useHomeVote,
  type HomeVoteSlotRegistration,
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
export { useWidgetSync } from './widget-gallery/use-widget-sync';
