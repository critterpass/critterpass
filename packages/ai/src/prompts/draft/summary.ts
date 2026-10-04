/**
 * The guide's one line under a finished draft ("Temples early, markets late, and the bamboo before
 * the crowds."), on the fast tier. It sees the day themes and whether every must-do made it, never
 * a number; a line with a digit or a link, a decline or a failed call falls back to a plain line.
 * When we know too few places in the destination to fill the days, the line says so instead of
 * passing a near-empty plan off as a draft.
 */
import { isDeclined, textOf } from '../../structured';
import { personaSystem, type DraftModel } from './context';
import type { PersonaId } from '../../persona/schema';
import { proseProblem } from './schema';

export const SUMMARY_MAX = 160;

export interface SummaryInput {
  readonly guide: PersonaId;
  readonly destination: string;
  readonly themes: readonly string[];
  readonly allMustDos: boolean;
  /** Place names the line may use as they are (digits included). */
  readonly names?: readonly string[];
  /** We know too few places here to fill the days: the line must say so. */
  readonly thin?: boolean;
}

const TASK = [
  '# Task',
  '',
  'Write one line (under 140 characters) that sums up the trip draft below, in your voice, for the',
  'organiser who will review it. Words only: no numbers, dates, times, prices, digits, emoji or links.',
  'Reply with the line and nothing else.',
].join('\n');

const THIN_TASK = [
  '# Task',
  '',
  'The trip draft below is sparse because we know only a few places in this destination so far.',
  'Write one line (under 140 characters), in your voice, that tells the organiser exactly that,',
  'plainly and without apology, and that they can add places from search for you to fit in.',
  'Words only: no numbers, dates, times, prices, digits, emoji or links.',
  'Reply with the line and nothing else.',
].join('\n');

export function templateSummary(input: SummaryInput): string {
  if (input.thin === true) {
    return `I only know a few places in ${input.destination} so far, so this draft is thin. Add places from search and I will fit them in.`;
  }
  return input.allMustDos
    ? `Every must-do made it into your ${input.destination} draft.`
    : `Here is your ${input.destination} draft. Fix anything before the crew sees it.`;
}

export async function writeDraftSummary(model: DraftModel, input: SummaryInput): Promise<string> {
  const facts = [
    `Destination: ${input.destination}`,
    `Day themes, in order: ${input.themes.join('; ')}`,
    input.allMustDos ? 'Every must-do made it.' : 'Some must-dos did not fit.',
    ...(input.thin === true
      ? ['We know only a few places here: most of each day is still open.']
      : []),
  ].join('\n');
  try {
    const result = await model.call(
      'draft.summary',
      {
        system: personaSystem(input.guide, input.thin === true ? THIN_TASK : TASK),
        messages: [{ role: 'user', content: facts }],
        temperature: 0.7,
      },
      'summary',
    );
    if (isDeclined(result.message)) return templateSummary(input);
    const line = textOf(result.message)
      .trim()
      .replace(/^["“'](.*)["”']$/u, '$1');
    if (line.length === 0 || line.length > SUMMARY_MAX || line.includes('\n')) {
      return templateSummary(input);
    }
    return proseProblem(line, SUMMARY_MAX, input.names ?? []) === null
      ? line
      : templateSummary(input);
  } catch {
    return templateSummary(input);
  }
}
