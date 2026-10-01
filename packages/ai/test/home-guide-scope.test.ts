/**
 * What a persona guides: its own destination inside a trip that has it as guide, any destination
 * when the conversation has no local guide (no trip yet, or a trip whose destination has none).
 * And how a local word's gloss is written: never a bracket inside a bracket.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCrewMentionRequest,
  buildGuideChatRequest,
  hasOwnGuide,
  renderPersonaBlock,
  REPO_PACKS,
  writtenGloss,
} from '../src';

const directives = { chattiness: 'normal', locale: 'en' } as const;
const chat = (anywhere?: boolean) =>
  JSON.stringify(
    buildGuideChatRequest({
      pack: REPO_PACKS.tokek,
      tripContext: undefined,
      history: [],
      question: 'What should I eat in Da Nang?',
      directives,
      ...(anywhere === undefined ? {} : { anywhere }),
    }).system,
  );

describe('the default guide with no local guide to hand over to', () => {
  it('guides for anywhere, sends the person to nobody, and keeps its own voice', () => {
    const block = renderPersonaBlock(REPO_PACKS.tokek, { anywhere: true });
    expect(block).toContain('their travel guide for anywhere in the world');
    expect(block).toContain('Never send them to another guide');
    expect(block).not.toContain('You are the live guide for');
    expect(block).toContain('You are Tokek, a Tokay gecko.');
    expect(block).toContain('Rise and shine.');
  });

  it('reaches the chat and the crew-chat mention prompts only when asked for', () => {
    expect(chat(true)).toContain('anywhere in the world');
    expect(chat(false)).toBe(chat());
    expect(chat()).toContain('You are the live guide for bali.');
    const mention = (anywhere: boolean) =>
      JSON.stringify(
        buildCrewMentionRequest({
          pack: REPO_PACKS.tokek,
          tripContext: undefined,
          window: [],
          directives,
          anywhere,
        }).system,
      );
    expect(mention(true)).toContain('anywhere in the world');
    expect(mention(false)).not.toContain('anywhere in the world');
  });

  it("leaves a trip's own guide exactly as it was", () => {
    expect(renderPersonaBlock(REPO_PACKS.chava)).toBe(
      renderPersonaBlock(REPO_PACKS.chava, { anywhere: false }),
    );
    expect(renderPersonaBlock(REPO_PACKS.chava)).toContain('You are the live guide for');
  });

  it('never loosens the guest guide, which hedges whatever the scope', () => {
    expect(renderPersonaBlock(REPO_PACKS.guest, { anywhere: true })).toBe(
      renderPersonaBlock(REPO_PACKS.guest),
    );
  });

  it('is chosen by whether the thread has a guide of its own', () => {
    expect(hasOwnGuide('chava')).toBe(true);
    expect(hasOwnGuide('tokek')).toBe(true);
    expect(hasOwnGuide(null)).toBe(false);
    expect(hasOwnGuide('a-place-without-a-guide')).toBe(false);
  });
});

describe('a local word and its gloss', () => {
  it('drops the bracket a gloss carries when it is written after the word', () => {
    expect(writtenGloss('thank you (Indonesian)')).toBe('thank you');
    expect(writtenGloss('the many-course dinner')).toBe('the many-course dinner');
    expect(writtenGloss('(Quechua) the sun')).toBe('the sun');
  });

  it('never nests brackets, for any persona in either scope', () => {
    const nested = /\([^()]*\(/u;
    for (const pack of Object.values(REPO_PACKS)) {
      for (const anywhere of [false, true]) {
        const block = renderPersonaBlock(pack, { anywhere });
        expect(nested.test(block), `${pack.id} ${String(anywhere)}`).toBe(false);
        for (const word of pack.local_words) {
          expect(block, pack.id).toContain(`"${word.term} (${writtenGloss(word.gloss)})"`);
          expect(writtenGloss(word.gloss), pack.id).not.toMatch(/[()[\]{}]/u);
          expect(writtenGloss(word.gloss).length, pack.id).toBeGreaterThan(0);
        }
      }
    }
  });
});
