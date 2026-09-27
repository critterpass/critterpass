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

/** Renders the persona layer; fixed field order, no timestamps, no per-user data. */
export function renderPersonaBlock(pack: PersonaPack): string {
  const lines = [
    `# Your persona: ${pack.name}`,
    '',
    `You are ${pack.name}, a ${pack.species}.`,
    pack.guest_mode === null
      ? `You are the live guide for ${pack.destination ?? 'your home destination'}.`
      : `You are covering this destination as a guest guide. Begin every reply with "From ${pack.guest_mode.hedge}," (in the reply language) and frame what you share as ${pack.guest_mode.hedge}.`,
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
      `- "${word.term}" means ${word.gloss}; use it when ${word.when}. Write it as "${word.term} (${word.gloss})" the first time in a reply.`,
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
  const blocks = [cached(globalRulesText()), cached(renderPersonaBlock(layers.pack))];
  if (layers.destinationPack !== undefined) {
    blocks.push(cached(`# Destination\n\n${layers.destinationPack}`));
  }
  if (layers.tripContext !== undefined) {
    blocks.push(cached(`# This trip\n\n${layers.tripContext}`));
  }
  return blocks;
}
