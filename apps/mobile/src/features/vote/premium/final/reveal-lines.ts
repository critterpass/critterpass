/**
 * The words around the winner stamp: the score ("Wins 4–2" or "Locked in"), who picked a place
 * locked in without a vote, the crew's line on the stamp, and the small notes for this viewer (the
 * tie rule, a missed vote, a pick that lost).
 */
import { useLingui } from '@lingui/react/macro';

import { originCity } from '../../data/use-final';
import type { PollView } from '../../data/poll-view';
import { money } from '../../format';
import { pollScore } from '../../data/poll-view';
import type { RevealOutcome } from './reveal-outcome';

export interface RevealNote {
  readonly id: string;
  readonly text: string;
}

export function useRevealLines({
  poll,
  outcome,
  winnerName,
  organiser,
  organiserName,
  crewName,
}: {
  readonly poll: PollView;
  readonly outcome: RevealOutcome;
  readonly winnerName: string;
  readonly organiser: boolean;
  readonly organiserName: string | null;
  readonly crewName: string | null;
}) {
  const { t, i18n } = useLingui();
  const { lockedIn, missed, lost } = outcome;
  const score = lockedIn
    ? t({ id: 'vote.reveal.lockedIn', message: 'Locked in' })
    : t({ id: 'vote.reveal.wins', message: `Wins ${pollScore(poll)}` });
  const lockedBy = organiser
    ? t({ id: 'vote.reveal.lockedByYou', message: 'You picked it' })
    : organiserName === null
      ? t({ id: 'vote.reveal.lockedByOrganiser', message: 'The organiser picked it' })
      : t({ id: 'vote.reveal.lockedBy', message: `${organiserName} picked it` });
  const picked =
    crewName === null
      ? t({ id: 'vote.premium.reveal.crewPickedPlain', message: 'Your crew picked' })
      : t({ id: 'vote.premium.reveal.crewPicked', message: `${crewName} picked` });
  const tie = poll.tieBreak;
  const notes = [
    lockedIn
      ? {
          id: 'reveal-locked-in',
          text: organiser
            ? t({
                id: 'vote.reveal.lockedNoteYou',
                message: `No vote needed: you locked ${winnerName} in. Next, the dates.`,
              })
            : t({
                id: 'vote.reveal.lockedNote',
                message: `No vote this time: ${winnerName} was locked in for the crew.`,
              }),
        }
      : null,
    !lockedIn && tie !== null
      ? {
          id: 'reveal-tie',
          text: t({
            id: 'vote.reveal.tie',
            message: `It was a tie. ${winnerName} won it: ${money(i18n.locale, tie.cheaperByMinor, tie.currency)} cheaper for the ${tie.memberCount} flying from ${originCity(tie.origin)}.`,
          }),
        }
      : null,
    missed
      ? {
          id: 'reveal-missed',
          text: t({
            id: 'vote.reveal.missed',
            message: `You missed this vote. The crew picked ${winnerName}.`,
          }),
        }
      : null,
    lost
      ? {
          id: 'reveal-lost',
          text: t({
            id: 'vote.reveal.lost',
            message: `Your pick lost this time. ${winnerName} it is.`,
          }),
        }
      : null,
  ].filter((note) => note !== null);
  return { score, lockedBy, picked, notes: notes as readonly RevealNote[] };
}
