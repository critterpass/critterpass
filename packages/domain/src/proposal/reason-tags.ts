/**
 * Why a stop is in a member's version of the proposal (3f-3): the reason tags the guide may give a
 * pick. The AI route's reply schema and the app's labels both read this list, so a tag the guide
 * writes always has a label to show.
 */
export const PROPOSAL_REASON_TAGS = [
  'your_must_do',
  'matches_taste',
  'crew_favourite',
  'good_value',
  'only_here',
] as const;

export type ProposalReasonTag = (typeof PROPOSAL_REASON_TAGS)[number];

export function isProposalReasonTag(value: string): value is ProposalReasonTag {
  return (PROPOSAL_REASON_TAGS as readonly string[]).includes(value);
}
