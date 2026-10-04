/**
 * The guide's note on each swipe card (route `explore.swipe_notes`, pro tier, structured, no
 * tools): one line per card in the guide's voice, keyed by card id. The cards arrive as curated
 * place data only (name, category, tags, our editorial line); never supplier content, never crew
 * chat. A note that names an unknown id, runs long or carries a link or emoji is dropped, and a
 * card without a note simply shows none.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { Gateway, GatewayInput } from '../../client';
import { renderPersonaBlock } from '../../persona/layering';
import { resolvePersonaPack } from '../../persona/resolve';
import type { PersonaId } from '../../persona/schema';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';

export const DECK_NOTES_ROUTE = 'explore.swipe_notes' as const;
export const DECK_NOTES_PROMPT_VERSION = 'swipe-notes@1';
export const DECK_NOTE_TEXT_MAX = 140;

export interface DeckNoteCard {
  /** Short local id (`c1`…): the model never sees a database id. */
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly why_go: string | null;
}

export interface DeckNotesInput {
  readonly guide: PersonaId;
  readonly destination: string;
  readonly cards: readonly DeckNoteCard[];
}

export const DECK_NOTES_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['notes'],
    properties: {
      notes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'note'],
          properties: { id: { type: 'string' }, note: { type: 'string' } },
        },
      },
    },
  },
};

const TASK = [
  '# Task',
  '',
  'The crew is swiping through places together. Write one short note per card in your own voice:',
  'why this place is worth a yes, the way you would say it to a friend.',
  `- One sentence, at most ${DECK_NOTE_TEXT_MAX - 20} characters, answered by card \`id\`.`,
  '- Use only what the card says. No prices, hours, distances or numbers of your own.',
  '- No emoji, no hashtags, no links.',
].join('\n');

export function buildDeckNotesRequest(input: DeckNotesInput): GatewayInput {
  return {
    system: [
      { type: 'text', text: renderPersonaBlock(resolvePersonaPack(input.guide)) },
      { type: 'text', text: TASK },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Cards for ${input.destination}:\n${input.cards.map((card) => JSON.stringify(card)).join('\n')}`,
          },
        ],
      },
    ],
    outputFormat: DECK_NOTES_FORMAT,
    temperature: 0.6,
  };
}

const NOTE_REJECT = /https?:\/\/|www\.|\p{Extended_Pictographic}|#\w/iu;

/** The notes that pass, by card id; everything else is dropped. */
export function validateDeckNotes(reply: unknown, input: DeckNotesInput): Map<string, string> {
  const notes = new Map<string, string>();
  const ids = new Set(input.cards.map((card) => card.id));
  const list = (reply as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(list)) return notes;
  for (const entry of list as unknown[]) {
    const { id, note } = (entry ?? {}) as { id?: unknown; note?: unknown };
    if (typeof id !== 'string' || typeof note !== 'string' || !ids.has(id) || notes.has(id)) {
      continue;
    }
    const text = note.trim().replace(/\s+/gu, ' ');
    if (text.length === 0 || text.length > DECK_NOTE_TEXT_MAX || NOTE_REJECT.test(text)) continue;
    notes.set(id, text);
  }
  return notes;
}

export async function writeDeckNotes(
  gateway: Pick<Gateway, 'callModel'>,
  input: DeckNotesInput,
  context: UsageContext = {},
): Promise<Map<string, string>> {
  if (input.cards.length === 0) return new Map();
  try {
    const result = await gateway.callModel(DECK_NOTES_ROUTE, buildDeckNotesRequest(input), context);
    if (isDeclined(result.message)) return new Map();
    return validateDeckNotes(parseStructuredText(textOf(result.message)), input);
  } catch {
    return new Map();
  }
}
