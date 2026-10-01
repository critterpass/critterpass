/**
 * System prompt layering in cache order (tools are sent separately, ahead of all of these):
 * global rules + action policy → persona → destination pack → trip context. Every layer is
 * rendered deterministically, so the same inputs give the same bytes and every user of a guide
 * shares the cached prefix (DeepSeek caches repeated prefixes automatically; each layer also ends
 * on an explicit cache breakpoint, at most four, for providers that take them).
 */
import type Anthropic from '@anthropic-ai/sdk';

import { GLOBAL_RULES } from '../prompts/global-rules.generated';
import type { PersonaPack } from './schema';

/**
 * The shared rules every guide starts with (src/prompts/global-rules.md, compiled into a module so
 * bundled services never read it from disk).
 */
export function globalRulesText(): string {
  return GLOBAL_RULES;
}

/** How each register level sounds, 0–5, so the voice is described rather than scored. */
const WARMTH = [
  'cool and matter-of-fact',
  'polite',
  'friendly',
  'warm',
  'very warm, sunny and upbeat',
  'bubbly and effusive',
] as const;
const HUMOUR = [
  'serious',
  'rarely joking',
  'lightly humorous',
  'playful',
  'funny',
  'a born joker',
] as const;
const DRYNESS = [
  'earnest',
  'mostly earnest',
  'with a hint of dry wit',
  'with a dry wit',
  'very dry',
  'deadpan',
] as const;

export interface PersonaBlockOptions {
  /**
   * The conversation has no local guide of its own: the person has no trip yet, or their trip's
   * destination has no guide. The persona then guides for any destination, instead of its home.
   */
  readonly anywhere?: boolean;
}

/**
 * A gloss as it is written after a local word, `term (gloss)`: a gloss that carries its own
 * bracket ("thank you (Indonesian)") drops it, so the written form never nests brackets.
 */
export function writtenGloss(gloss: string): string {
  const plain = gloss
    .replace(/\s*[([{][^)\]}]*[)\]}]/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  return plain === '' ? gloss.replace(/[()[\]{}]/gu, '').trim() : plain;
}

/** What the persona guides, in one or more lines. */
function scopeLines(pack: PersonaPack, options: PersonaBlockOptions): string[] {
  if (pack.guest_mode !== null) {
    return [
      `You are covering this destination as a guest guide. Begin every reply with "From ${pack.guest_mode.hedge}," (in the reply language) and frame what you share as ${pack.guest_mode.hedge}.`,
    ];
  }
  const home = pack.destination ?? 'your home destination';
  if (options.anywhere !== true) return [`You are the live guide for ${home}.`];
  return [
    `Your home is ${home}, but this person has no trip with a local guide yet, so in this conversation you are their travel guide for anywhere in the world.`,
    'Answer about any destination helpfully and concretely: where to go, when, what to eat, what to see, how to get their crew planning. Never say a place is outside your patch, and never ask for a destination and dates before you help.',
    'Asked where to go next, suggest two or three places, each with one reason, then offer to start planning one. Fit them to what the conversation and the context tell you about this person; when you know nothing about them yet, do not invent their tastes: offer a varied shortlist.',
    'A question that names no place (which month is best, how long do we need) still gets something useful first, such as the best months for two or three kinds of trip, and then one question to narrow it down.',
    'Never send them to another guide or tell them to ask one: they cannot reach any guide but you. You may add, at most once in a conversation, one short line that a local guide joins their crew once a trip there exists.',
  ];
}

/**
 * Renders the persona layer; fixed field order, no timestamps, no per-user data (the two scopes
 * are two stable blocks, so each still shares its cached prefix).
 */
export function renderPersonaBlock(pack: PersonaPack, options: PersonaBlockOptions = {}): string {
  const lines = [
    `# Your persona: ${pack.name}`,
    '',
    `You are ${pack.name}, a ${pack.species}.`,
    ...scopeLines(pack, options),
    `Your line: "${pack.tagline}"`,
    'Stay in character in every reply, even a one-line answer or a question: your warmth, humour and way of speaking should be recognisable in a single sentence.',
    `Your voice: ${WARMTH[pack.register.warmth]}, ${HUMOUR[pack.register.humour]}, ${DRYNESS[pack.register.dryness]}.`,
  ];
  if (pack.catchphrases.length > 0) {
    lines.push('', 'Lines you are known for (use sparingly, never twice in a row):');
    for (const phrase of pack.catchphrases) lines.push(`- ${phrase}`);
  }
  lines.push(
    '',
    'Local words you may use (only these, only with this meaning, and no more per reply than the chattiness instruction allows, even when a tool result contains them):',
  );
  if (pack.local_words.length === 0) lines.push('- none yet: use none.');
  for (const word of pack.local_words) {
    lines.push(
      `- "${word.term}" means ${word.gloss}; use it when ${word.when}. Write it as "${word.term} (${writtenGloss(word.gloss)})" the first time in a reply.`,
    );
  }
  if (pack.taboos.length > 0) {
    lines.push('', 'Never:');
    for (const taboo of pack.taboos) lines.push(`- ${taboo}`);
  }
  if (pack.sign_off !== null)
    lines.push('', `Sign-off, when a reply naturally ends a conversation: ${pack.sign_off}`);
  return `${lines.join('\n')}\n`;
}

export interface PromptLayers {
  readonly pack: PersonaPack;
  /** Curated destination content; never set for the guest guide (it has no curated pack). */
  readonly destinationPack?: string;
  /** Privacy-filtered trip context rendered from llm.* views. */
  readonly tripContext?: string;
  /** No local guide of its own: the persona guides for any destination (see `renderPersonaBlock`). */
  readonly anywhere?: boolean;
}

const cached = (text: string): Anthropic.Messages.TextBlockParam => ({
  type: 'text',
  text,
  cache_control: { type: 'ephemeral' },
});

export function buildSystemBlocks(layers: PromptLayers): Anthropic.Messages.TextBlockParam[] {
  if (layers.pack.guest_mode !== null && layers.destinationPack !== undefined) {
    throw new Error('the guest guide has no curated destination pack');
  }
  const blocks = [
    cached(globalRulesText()),
    cached(renderPersonaBlock(layers.pack, { anywhere: layers.anywhere === true })),
  ];
  if (layers.destinationPack !== undefined) {
    blocks.push(cached(`# Destination\n\n${layers.destinationPack}`));
  }
  if (layers.tripContext !== undefined) {
    blocks.push(cached(`# This trip\n\n${layers.tripContext}`));
  }
  return blocks;
}
