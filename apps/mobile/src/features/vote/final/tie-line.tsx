/**
 * The final's small print: "You voted Kyoto.", who is still to vote ("DEV AND RIN TO GO"), and the
 * tie rule in numbers the server froze ("A tie goes to Kyoto: it's $440 cheaper for the four
 * flying from Singapore."). Without comparable prices the tie line is left out.
 */
import { useLingui } from '@lingui/react/macro';

import { originCity } from '../data/use-final';
import type { Person } from '../data/use-people';
import type { PollView } from '../data/poll-view';
import type { BoardPlace } from '../data/use-board';
import { money } from '../format';

export interface FinalLines {
  readonly voted: string | null;
  readonly toGo: string | null;
  readonly tieShort: string | null;
  readonly tieFull: string | null;
}

function nameOf(poll: PollView, places: ReadonlyMap<string, BoardPlace>, optionId: string): string {
  const option = poll.options.find((candidate) => candidate.id === optionId);
  if (option === undefined) return '';
  return (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
}

/** "Dev and Rin", "Dev, Rin and Ana". */
function listNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1] ?? ''}`;
}

/** Who is still to vote, alphabetical, so the line and the faces read the same on every phone. */
export function pendingByName(poll: PollView, people: ReadonlyMap<string, Person>): string[] {
  const nameOf = (id: string) => people.get(id)?.name ?? '';
  return [...poll.pendingIds].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

export function useFinalLines(
  poll: PollView,
  places: ReadonlyMap<string, BoardPlace>,
  people: ReadonlyMap<string, Person>,
): FinalLines {
  const { t, i18n } = useLingui();
  const tie = poll.tiePreview;
  const pending = pendingByName(poll, people)
    .map((id) => people.get(id)?.name.split(' ')[0] ?? '')
    .filter((n) => n !== '');
  const and = t({ id: 'vote.final.and', message: 'and' });
  const tiePlace = tie === null ? null : nameOf(poll, places, tie.winnerOptionId);
  const count = tie?.memberCount ?? 0;
  return {
    voted:
      poll.myOptionId === null
        ? null
        : t({
            id: 'vote.final.youVoted',
            message: `You voted ${nameOf(poll, places, poll.myOptionId)}.`,
          }),
    toGo:
      poll.pendingIds.length === 0
        ? t({ id: 'vote.final.allIn', message: "Everyone's in" })
        : pending.length < poll.pendingIds.length
          ? t({ id: 'vote.final.toGoCount', message: `${poll.pendingIds.length} to go` })
          : t({ id: 'vote.final.toGo', message: `${listNames(pending, and)} to go` }),
    tieShort:
      tiePlace === null
        ? null
        : t({ id: 'vote.final.tieShort', message: `A tie goes to ${tiePlace}.` }),
    tieFull:
      tie === null || tiePlace === null
        ? null
        : t({
            id: 'vote.final.tieFull',
            message: `A tie goes to ${tiePlace}: it's ${money(i18n.locale, tie.cheaperByMinor, tie.currency)} cheaper for the ${count} flying from ${originCity(tie.origin)}.`,
          }),
  };
}
