/**
 * Whose language a personal proposal version is written in: the recipient's app language
 * (`app.user_locale`), read with the rest of what the guide may know about them, with their share
 * punctuated the way that language writes money. Real database; no model call.
 */
import { buildVersionRequest } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadVersionContext, loadVersionTarget } from '../../src/jobs/proposal/version-context';
import { startProposalWorld, type NAMES, type ProposalWorld } from './proposal-world';

let world: ProposalWorld;

beforeAll(async () => {
  world = await startProposalWorld();
  // Dev's app is in Vietnamese (what `set_app_locale` stores); everyone else reads English.
  await world.q(
    `INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')
     ON CONFLICT (user_id) DO UPDATE SET app_locale = 'vi'`,
    [world.users.Dev],
  );
}, 240_000);

afterAll(async () => {
  await world.stop();
});

async function contextFor(name: (typeof NAMES)[number]) {
  const [row] = await world.q<{ id: string }>(
    'SELECT id FROM proposal_versions WHERE proposal_id = $1 AND recipient_id = $2',
    [world.proposalId, world.users[name]],
  );
  const target = await loadVersionTarget(world.harness.pool, row!.id);
  return (await loadVersionContext(world.harness.pool, target!)).context;
}

describe("a personal version's language", () => {
  it("is the recipient's app language, and asked of the model", async () => {
    const context = await contextFor('Dev');
    expect(context.locale).toBe('vi');
    expect(JSON.stringify(buildVersionRequest(context))).toContain(
      '[Reply language: Vietnamese (vi).]',
    );
  });

  it('stays English for a recipient whose app is in English', async () => {
    const context = await contextFor('Rin');
    expect(context.locale).toBe('en');
    expect(JSON.stringify(buildVersionRequest(context))).not.toContain('Reply language');
  });

  it("writes the recipient's own amounts the way their language writes money", async () => {
    const [vi, en] = await Promise.all([contextFor('Dev'), contextFor('Rin')]);
    // Same engine, same numbers; only the punctuation follows the reader.
    if (en.share !== null && vi.share !== null) {
      expect(en.share).toMatch(/^[^\d]*\d[\d,]*(\.\d+)?[^\d]*$/u);
      expect(vi.share).not.toMatch(/,\d{3}/u);
    }
    expect(vi.savings.every((saving) => !/,\d{3}/u.test(saving.amount))).toBe(true);
  });
});
