import { POLL_MIN_OPTIONS } from '@cp/domain';

export type PollDeadline = 'none' | 'hour' | 'day' | 'days';

export const DEADLINE_MS: Readonly<Record<PollDeadline, number | null>> = {
  none: null,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 3 * 24 * 60 * 60 * 1000,
};

export interface PollDraft {
  readonly question: string;
  readonly options: readonly string[];
  readonly deadline: PollDeadline;
  readonly allowChange: boolean;
}

/** The draft's answers that count (trimmed, non-empty); null while the draft cannot be posted. */
export function postableOptions(draft: PollDraft): string[] | null {
  const options = draft.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const distinct = new Set(options.map((option) => option.toLocaleLowerCase()));
  if (draft.question.trim().length === 0) return null;
  if (options.length < POLL_MIN_OPTIONS || distinct.size !== options.length) return null;
  return options;
}

/** What still stops the draft from being posted, for the line over the button; null when ready. */
export function postBlocker(draft: PollDraft): 'question' | 'answers' | 'same' | null {
  if (draft.question.trim().length === 0) return 'question';
  const options = draft.options
    .map((option) => option.trim().toLocaleLowerCase())
    .filter((option) => option.length > 0);
  if (options.length < POLL_MIN_OPTIONS) return 'answers';
  return new Set(options).size === options.length ? null : 'same';
}
