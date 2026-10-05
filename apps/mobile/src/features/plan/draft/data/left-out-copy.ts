/** The guide's words for why an essential place is not in a draft (./left-out.ts). */
import { t } from '@lingui/core/macro';

/** Why an essential place is not in the draft, in the guide's words; null for a reason unknown here. */
export function leftOutWhy(reason: string): string | null {
  switch (reason) {
    case 'no_room':
      return t({ id: 'planDraft.leftOut.noRoom', message: 'No room in the days.' });
    case 'held_in_the_way':
      return t({ id: 'planDraft.leftOut.held', message: 'No room around your stops.' });
    case 'closed':
      return t({ id: 'planDraft.leftOut.closed', message: 'Closed on your dates.' });
    case 'too_far':
      return t({ id: 'planDraft.leftOut.tooFar', message: 'Too far for a day of this trip.' });
    case 'not_offered':
      return t({ id: 'planDraft.leftOut.notOffered', message: 'I didn’t get to consider it.' });
    case 'needs_a_day':
      return t({
        id: 'planDraft.leftOut.needsDay',
        message: 'It takes a whole day, and none was left.',
      });
    case 'redrafted_out':
      return t({
        id: 'planDraft.leftOut.redraftedOut',
        message: 'A redraft took it out, and no other day had room.',
      });
    case 'days_full':
      return t({ id: 'planDraft.leftOut.daysFull', message: 'The days are full.' });
    case 'mornings_taken':
      return t({
        id: 'planDraft.leftOut.morningsTaken',
        message:
          'Its best time is the morning, and the mornings went to places that need them more.',
      });
    default:
      return null;
  }
}
