/**
 * System prompt layering in cache order (tools are sent separately, ahead of all of these):
 * global rules + action policy → persona → destination pack → trip context. Every layer is
 * rendered deterministically, so the same inputs give the same bytes and every user of a guide
 * shares the cached prefix; each layer ends on a cache breakpoint (at most four).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeTier } from '@cp/domain';

import { GLOBAL_RULES } from '../prompts/global-rules.generated';
import type { PersonaPack } from './schema';

/**
 * The shared rules every guide starts with (src/prompts/global-rules.md, compiled into a module so
 * bundled services never read it from disk).
 */
export function globalRulesText(): string {
  return GLOBAL_RULES;
}

const REGISTER_WORDS = ['none', 'a touch', 'some', 'moderate', 'plenty', 'lots'] as const;

/** Renders the persona layer; fixed field order, no timestamps, no per-user data. */
export function renderPersonaBlock(pack: PersonaPack): string {
  const lines = [
    `# Your persona: ${pack.name}`,
    '',
    `You are ${pack.name}, a ${pack.species}.`,
    pack.guest_mode === null
      ? `You are the live guide for ${pack.destination ?? 'your home destination'}.`
      : `You are covering this destination as a guest guide. Frame what you share as ${pack.guest_mode.hedge}.`,
    `Your line: "${pack.tagline}"`,
    `Warmth: ${REGISTER_WORDS[pack.register.warmth]}. Humour: ${REGISTER_WORDS[pack.register.humour]}. Dryness: ${REGISTER_WORDS[pack.register.dryness]}.`,
  ];
  if (pack.catchphrases.length > 0) {
    lines.push('', 'Lines you are known for (use sparingly, never twice in a row):');
    for (const phrase of pack.catchphrases) lines.push(`- ${phrase}`);
  }
  lines.push('', 'Local words you may use (only these, only with this meaning):');
  if (pack.local_words.length === 0) lines.push('- none yet: use none.');
  for (const word of pack.local_words) {
    lines.push(`- "${word.term}" means ${word.gloss}; use it when ${word.when}.`);
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

/** Minimum cacheable prompt prefix per model tier (prompt caching docs). */
export const MIN_CACHEABLE_PREFIX_TOKENS: Readonly<Record<ClaudeTier, number>> = {
  haiku: 4096,
  sonnet: 1024,
  opus: 512,
};

/**
 * A conservative lower bound on a text's token count: every whitespace-separated chunk is at least
 * one token. The real count (count_tokens endpoint) is always at least this.
 */
export function tokenLowerBound(text: string): number {
  return text.split(/\s+/u).filter((chunk) => chunk.length > 0).length;
}

/** True when the always-shared layers alone (global rules + persona) clear the tier's minimum. */
export function sharedPrefixIsCacheable(tier: ClaudeTier, pack: PersonaPack): boolean {
  const shared = `${globalRulesText()}${renderPersonaBlock(pack)}`;
  return tokenLowerBound(shared) >= MIN_CACHEABLE_PREFIX_TOKENS[tier];
}
