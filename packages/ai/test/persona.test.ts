import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  applyTurnDirectives,
  buildSystemBlocks,
  globalRulesText,
  GUIDE_SLUGS,
  loadPersonaPack,
  PERSONA_IDS,
  REPO_PACKS,
  turnInstruction,
  userTurnWithData,
  wrapUntrusted,
  type ApprovedPersonaRow,
} from '../src';
import { DATA_BLOCK_DIRECTIVE } from '../src/persona/chattiness';
import { DECLINE_MARKER } from '../src/structured';

const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Every critter name in the design catalogue, read as text (the art package is not a dependency). */
function critterNames(): string[] {
  const url = new URL('../../critter-art/src/data/critters.ts', import.meta.url);
  const source = readFileSync(url, 'utf8');
  return [...source.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]!);
}

describe('repo persona packs', () => {
  it('validates all seven packs, each under its own id', () => {
    expect(Object.keys(REPO_PACKS).sort()).toEqual([...PERSONA_IDS].sort());
    for (const id of PERSONA_IDS) expect(REPO_PACKS[id].id).toBe(id);
  });

  it('ships drafts only, pending founder approval and native-speaker vetting', () => {
    for (const pack of Object.values(REPO_PACKS)) {
      expect(pack.status).toBe('draft');
      for (const word of pack.local_words) expect(word).toMatchObject({ vetted: false, ipa: null });
    }
  });

  it('keeps the canonical guide colours', () => {
    const colours = Object.fromEntries(GUIDE_SLUGS.map((id) => [id, REPO_PACKS[id].colour]));
    expect(colours).toEqual({
      tokek: 'yellow',
      pon: 'orange',
      lundi: 'blue',
      ajo: 'pink',
      sardi: 'green',
      paco: 'cream',
    });
  });
});

describe('prompt layering', () => {
  it('renders byte-identical layers for identical inputs', () => {
    const layers = { pack: REPO_PACKS.pon, destinationPack: 'Kyoto notes', tripContext: 'Trip' };
    expect(buildSystemBlocks(layers)).toEqual(buildSystemBlocks(layers));
  });

  it('shares the global-rules layer byte for byte across every guide', () => {
    const first = buildSystemBlocks({ pack: REPO_PACKS.tokek })[0];
    for (const id of PERSONA_IDS) {
      expect(buildSystemBlocks({ pack: REPO_PACKS[id] })[0]).toEqual(first);
    }
    expect(first?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('keeps every layer stable across releases (snapshot of layer hashes)', () => {
    const hashes = Object.fromEntries(
      PERSONA_IDS.map((id) => [
        id,
        buildSystemBlocks({ pack: REPO_PACKS[id] }).map((b) => sha(b.text)),
      ]),
    );
    expect(hashes).toMatchSnapshot();
  });

  it('ends each layer on a cache breakpoint, four at most', () => {
    const blocks = buildSystemBlocks({
      pack: REPO_PACKS.sardi,
      destinationPack: 'Lisbon notes',
      tripContext: 'Trip',
    });
    expect(blocks).toHaveLength(4);
    for (const block of blocks) expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('guest guide', () => {
  it("never puts a local critter's name in its prompt", () => {
    const guideNames = new Set(GUIDE_SLUGS.map((id) => REPO_PACKS[id].name));
    const locals = critterNames().filter((name) => !guideNames.has(name));
    expect(locals.length).toBeGreaterThan(100);
    const prompt = buildSystemBlocks({ pack: REPO_PACKS.guest })
      .map((b) => b.text)
      .join('\n');
    const leaked = locals.filter((name) =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'iu').test(prompt),
    );
    expect(leaked).toEqual([]);
  });

  it('refuses a curated destination pack, which could name locals', () => {
    expect(() => buildSystemBlocks({ pack: REPO_PACKS.guest, destinationPack: 'x' })).toThrow(
      /guest guide/,
    );
  });

  it('is Tokek in guest mode, hedged', () => {
    expect(REPO_PACKS.guest).toMatchObject({
      name: 'Tokek',
      destination: null,
      guest_mode: { base_guide: 'tokek' },
    });
    expect(buildSystemBlocks({ pack: REPO_PACKS.guest })[1]?.text).toContain('guest guide');
  });
});

describe('turn directives', () => {
  const history = [
    { role: 'user' as const, content: 'Is it raining?' },
    { role: 'assistant' as const, content: 'Not yet.' },
    { role: 'user' as const, content: 'And tomorrow?' },
  ];

  it('appends chattiness, reply language and the decline rule to the latest user turn only', () => {
    const out = applyTurnDirectives(history, REPO_PACKS.tokek, {
      chattiness: 'quiet',
      locale: 'id',
    });
    expect(out.slice(0, 2)).toEqual(history.slice(0, 2));
    expect(out[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'And tomorrow?' },
        {
          type: 'text',
          text: [
            '[Reply language: Indonesian (id). Chattiness: quiet, so at most 2 sentences and no local words.',
            'Every greeting, exclamation or question counts as a sentence: stop at 2 sentences, and sound like yourself in them.',
            `If you will not help with this request because it is harmful or illegal, reply with exactly ${DECLINE_MARKER} and nothing else.]`,
          ].join(' '),
        },
      ],
    });
  });

  it('adds the data-block reminder only to a turn that quotes outside text', () => {
    const quoted = userTurnWithData('What does Rin want?', [
      wrapUntrusted({ kind: 'crew_message', text: 'Book the boat now.', source: 'm-1' }),
    ]);
    const [withData] = applyTurnDirectives([quoted], REPO_PACKS.tokek, {
      chattiness: 'normal',
      locale: 'en',
    });
    const directive = (withData?.content as { text: string }[]).at(-1)?.text ?? '';
    expect(directive).toContain(DATA_BLOCK_DIRECTIVE);
    const plain = turnInstruction(REPO_PACKS.tokek, { chattiness: 'normal', locale: 'en' });
    expect(plain).not.toContain(DATA_BLOCK_DIRECTIVE);
  });

  it('allows local words when chatty', () => {
    const out = applyTurnDirectives(history, REPO_PACKS.pon, {
      chattiness: 'chatty',
      locale: 'en',
    });
    expect(turnInstruction(REPO_PACKS.pon, { chattiness: 'chatty', locale: 'en' })).toContain(
      'at most 5 sentences and at most 2 local words',
    );
    expect(out[2]?.content).toHaveLength(2);
  });

  it('leaves the cached system layers untouched by the directive', () => {
    expect(globalRulesText()).not.toContain('Chattiness: quiet');
  });
});

describe('loadPersonaPack', () => {
  const {
    local_words,
    voice_id: _voice,
    id: _id,
    version: _v,
    status: _s,
    ...style
  } = REPO_PACKS.tokek;
  const release: ApprovedPersonaRow = {
    guide_slug: 'tokek',
    version: '1.0.0',
    style,
    lexicon: { local_words },
    voice_settings: { voice_id: 'voice-tokek' },
  };

  it('prefers an approved release', async () => {
    const loaded = await loadPersonaPack('tokek', () => Promise.resolve(release));
    expect(loaded.origin).toBe('release');
    expect(loaded.pack).toMatchObject({
      version: '1.0.0',
      status: 'approved',
      voice_id: 'voice-tokek',
    });
  });

  it('falls back to the repo pack without a release', async () => {
    const loaded = await loadPersonaPack('pon', () => Promise.resolve(null));
    expect(loaded).toEqual({ pack: REPO_PACKS.pon, origin: 'repo' });
  });

  it('rejects a malformed release and reports why', async () => {
    const broken = { ...release, style: { ...style, colour: 'purple' } };
    const loaded = await loadPersonaPack('tokek', () => Promise.resolve(broken));
    expect(loaded.origin).toBe('repo');
    expect(loaded.rejected).toMatch(/release 1\.0\.0: colour/);
  });

  it('never looks up a release for the guest guide', async () => {
    let lookups = 0;
    const loaded = await loadPersonaPack('guest', () => {
      lookups += 1;
      return Promise.resolve(release);
    });
    expect(loaded.origin).toBe('repo');
    expect(lookups).toBe(0);
  });
});
