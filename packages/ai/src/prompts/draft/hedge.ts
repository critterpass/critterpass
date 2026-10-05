/**
 * A guide that is still learning a city opens its chat replies with a hedge ("From what Ngựa knows
 * so far,"). A plan is not a reply: its titles, summaries and stop notes are short lines in the
 * reader's language, and the hedge, an English phrase the persona block spells out, would sit in
 * front of every one of them. The task says so, and a line that carries it anyway loses it here.
 */
import { resolvePersonaPack } from '../../persona/resolve';
import type { PersonaId } from '../../persona/schema';

export const PLAN_VOICE =
  'This task writes a plan, not a chat reply: the rule to begin every reply with "From …," does not apply here. Never open a title, a summary or a note with that phrase, in any language.';

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** `text` without the guide's hedge in front of it, its first letter capitalised again. */
export function withoutHedge(text: string, guide: PersonaId): string {
  const pack = resolvePersonaPack(guide);
  const hedge = pack.guest_mode?.hedge ?? pack.learning?.hedge;
  if (hedge == null) return text;
  const rest = text.replace(new RegExp(`^\\s*from\\s+${escaped(hedge)}\\s*[,:]?\\s*`, 'iu'), '');
  if (rest.length === text.length || rest.length === 0) return text;
  return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
}
