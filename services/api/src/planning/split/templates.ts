/**
 * The words for a way out when the guide does not word it (the switch is off, the call failed or
 * declined, or the caller's fair-use cap is spent): plain templates over the candidate's own data,
 * in the reader's language (English unless Vietnamese), so the screen never waits on a model.
 */
import type { SplitCandidate } from './candidates';

export interface OptionWords {
  readonly title: string;
  readonly body: string;
}

const TITLE_MAX = 24;

const fit = (text: string): string =>
  text.length <= TITLE_MAX ? text : `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;

const list = (names: readonly string[], and: string): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1] ?? ''}`;

export function templateWords(candidate: SplitCandidate, locale: string): OptionWords {
  const vi = locale.toLowerCase().startsWith('vi');
  const when = `${candidate.day} ${vi ? 'lúc' : 'at'} ${candidate.startsAt}`;
  switch (candidate.kind) {
    case 'split_group':
      return vi
        ? {
            title: fit('AI MUỐN THÌ ĐI SỚM'),
            body: `${list(candidate.attendees, 'và')} đi ${when}. Mọi người khác được nghỉ.`,
          }
        : {
            title: fit('KEEN ONES GO EARLY'),
            body: `${list(candidate.attendees, 'and')} go ${when}. Everyone else has the time free.`,
          };
    case 'alternative':
      return vi
        ? {
            title: fit(`ĐI ${candidate.placeName.toUpperCase()} THAY`),
            body: `Cả nhóm cùng đi ${when}.`,
          }
        : {
            title: fit(`${candidate.placeName.toUpperCase()} INSTEAD`),
            body: `Everyone goes ${when}.`,
          };
    case 'reschedule':
      return vi
        ? { title: fit('ĐI LÚC VẮNG NGƯỜI'), body: `Cả nhóm cùng đi ${when}, lúc vắng nhất.` }
        : { title: fit("GO WHEN IT'S QUIET"), body: `Everyone goes ${when}, the quietest time.` };
  }
}
