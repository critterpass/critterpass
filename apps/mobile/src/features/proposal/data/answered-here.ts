/**
 * The answer a member just gave on this phone, kept until its participant row syncs back: the
 * command is applied on the server first, so for a moment the local row still says "no reply" and
 * the member's version would ask them again.
 */
export type GivenAnswer = 'in' | 'maybe' | 'out';

const given = new Map<string, GivenAnswer>();

export function rememberAnswer(proposalId: string, answer: GivenAnswer): void {
  given.set(proposalId, answer);
}

export function answerGivenHere(proposalId: string): GivenAnswer | null {
  return given.get(proposalId) ?? null;
}

/** The answer to show: the synced one once it says anything, else the one given here. */
export function standingAnswer(
  synced: string | null | undefined,
  proposalId: string,
): 'in' | 'maybe' | 'out' | 'waitlisted' | null {
  if (synced === 'in' || synced === 'maybe' || synced === 'out' || synced === 'waitlisted') {
    // A newer answer given here (in after maybe) stands until the row catches up.
    const here = answerGivenHere(proposalId);
    if (here !== null && here !== synced && synced === 'maybe') return here;
    return synced;
  }
  return answerGivenHere(proposalId);
}
