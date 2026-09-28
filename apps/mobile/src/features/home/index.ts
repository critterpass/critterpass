/** Home's public surface for other features: the vote slot, inbox renderers and nudging. */
export { registerHomeVoteSlot, type HomeVoteSlotRegistration, type VoteSlotProps } from './slots';
export {
  registerInboxRenderer,
  type InboxCardCopy,
  type InboxRenderContext,
  type InboxRenderer,
} from './inbox/kind-renderers';
export type { InboxItem } from './inbox/inbox-data';
export { useNudge, type NudgeOutcome } from './nudge/use-nudge';
export { homeRoutes, HOME_ROUTES } from './routes';
