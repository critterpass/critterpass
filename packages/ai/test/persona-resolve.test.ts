import { describe, expect, it } from 'vitest';

import {
  buildSystemBlocks,
  GUIDE_SLUGS,
  loadPersonaPack,
  personaIdSchema,
  personaPackSchema,
  renderPersonaBlock,
  REPO_PACKS,
  resolvePersonaPack,
  type ApprovedPersonaRow,
} from '../src';
import { buildCrewWelcomeRequest } from '../src/prompts/crew-welcome/prompt';

describe('persona ids', () => {
  it('accept the slug of any guide and refuse a slug no critter folds to', () => {
    for (const slug of [...GUIDE_SLUGS, 'guest', 'ngua', 'chep', 'curua']) {
      expect(personaIdSchema.safeParse(slug).success, slug).toBe(true);
    }
    for (const slug of ['nobody', 'Ngựa', 'cp-006', '', null]) {
      expect(personaIdSchema.safeParse(slug).success, String(slug)).toBe(false);
    }
  });
});

describe('resolvePersonaPack', () => {
  it('gives the guides with a written pack that pack, unchanged', () => {
    for (const slug of [...GUIDE_SLUGS, 'guest'] as const) {
      expect(resolvePersonaPack(slug)).toBe(REPO_PACKS[slug]);
      expect(REPO_PACKS[slug].learning ?? null).toBeNull();
    }
  });

  it('falls back to Tokek for a slug that is no guide', () => {
    expect(resolvePersonaPack('nobody')).toBe(REPO_PACKS.tokek);
    expect(resolvePersonaPack(null)).toBe(REPO_PACKS.tokek);
  });

  it("builds a guide without a written pack from its critter's facts", () => {
    const pack = resolvePersonaPack('ngua');
    expect(personaPackSchema.safeParse(pack).success).toBe(true);
    expect(pack).toMatchObject({
      id: 'ngua',
      name: 'Ngựa',
      species: 'Flower pony',
      destination: 'Đà Lạt, Vietnam',
      voice_id: null,
      guest_mode: null,
      learning: { hedge: 'what Ngựa knows so far' },
    });
    expect(resolvePersonaPack('ngua')).toBe(pack);
  });

  it('speaks as its own city’s guide, hedged, and never as Tokek or a guest guide', () => {
    for (const slug of ['ngua', 'chep', 'curua']) {
      const pack = resolvePersonaPack(slug);
      const block = renderPersonaBlock(pack);
      expect(block).toContain(`You are ${pack.name}, a ${pack.species}.`);
      expect(block).toContain(`Begin every reply with "From what ${pack.name} knows so far,"`);
      expect(block).toContain('Never present a guess as local knowledge');
      expect(JSON.stringify(pack)).not.toMatch(/tokek/iu);
      expect(block).not.toMatch(/tokek|guest guide/iu);
      // Its destination may have curated notes: the template takes them, the guest guide cannot.
      expect(buildSystemBlocks({ pack, destinationPack: 'notes' })).toHaveLength(3);
    }
  });

  it('reaches the prompt builders through the same resolver', () => {
    const request = buildCrewWelcomeRequest({
      guide: 'ngua',
      newcomer: 'Linh',
      crewName: 'Dalat five',
      members: 3,
      place: 'Đà Lạt',
    });
    expect(JSON.stringify(request.system)).toContain('You are Ngựa, a Flower pony.');
  });
});

describe('loadPersonaPack for a guide without a written pack', () => {
  it('uses the template until a release is approved, then the release', async () => {
    const template = await loadPersonaPack('ngua', () => Promise.resolve(null));
    expect(template).toEqual({ pack: resolvePersonaPack('ngua'), origin: 'template' });

    const {
      local_words,
      voice_id: _voice,
      id: _id,
      version: _v,
      status: _s,
      ...style
    } = {
      ...REPO_PACKS.chava,
      name: 'Ngựa',
    };
    const asked: string[] = [];
    const release: ApprovedPersonaRow = {
      guide_slug: 'ngua',
      version: 'content-v1',
      style,
      lexicon: { local_words },
      voice_settings: { voice_id: null },
    };
    const loaded = await loadPersonaPack('ngua', (slug) => {
      asked.push(slug);
      return Promise.resolve(release);
    });
    expect(asked).toEqual(['ngua']);
    expect(loaded.origin).toBe('release');
    expect(loaded.pack).toMatchObject({ id: 'ngua', name: 'Ngựa', status: 'approved' });
    expect(loaded.pack.learning ?? null).toBeNull();
  });
});
