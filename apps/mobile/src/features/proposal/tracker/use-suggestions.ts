/**
 * {GUIDE} SUGGESTS (3f-6): the open suggestions the worker made for the organiser, in the guide's
 * words (a resend at the recipient's evening hour with a lead item, an offer everyone can take
 * without naming who asked). Acting runs it; dismissing hides it. A handled one leaves the list.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCommand } from '@/data/commands/use-command';

import { dismissSuggestionCommand, executeSuggestionCommand } from '../data/commands';
import { useLiveRows } from '../data/rows';

const SQL = `SELECT id, kind, copy FROM rsvp_suggestions
  WHERE proposal_id = ? AND status = 'open' ORDER BY created_at`;

export interface SuggestionRow {
  readonly id: string;
  readonly kind: string;
  readonly copy: string;
}

export function useSuggestions(proposalId: string) {
  const { rows } = useLiveRows<SuggestionRow>(SQL, [proposalId], ['rsvp_suggestions']);
  const execute = useCommand(executeSuggestionCommand);
  const dismiss = useCommand(dismissSuggestionCommand);
  return {
    rows,
    act: (id: string) => void execute.send({ suggestion_id: id }),
    dismiss: (id: string) => void dismiss.send({ suggestion_id: id }),
  };
}
