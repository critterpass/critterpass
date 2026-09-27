import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadImage } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerFonts, renderCardNode } from '../backend-node';
import type { CardLayout } from '../model';
import {
  critterCardFixture,
  memoryFixture,
  planPreviewFixture,
  postcardFixture,
  posterFixture,
  recapAwardsFixture,
  recapCoverFixture,
  recapMissedFixture,
  recapReceiptFixture,
  recapRouteFixture,
  recapStampFixture,
} from './__states__/fixtures';
import { buildCritterCard, buildCritterCardStory, critterCardAltText } from './critter-card';
import { buildMemoryStory, memoryAltText } from './memory';
import { buildPlanPreview, planPreviewAltText } from './plan-preview';
import {
  buildPostcardBack,
  buildPostcardBackPrint,
  buildPostcardFront,
  buildPostcardFrontPrint,
  postcardAltText,
} from './postcard';
import { buildPoster, posterAltText } from './poster';
import { buildRecapAwards, buildRecapAwardsStory, recapAwardsAltText } from './recap-awards';
import { buildRecapCover, buildRecapCoverStory, recapCoverAltText } from './recap-cover';
import { buildRecapMissed, buildRecapMissedStory, recapMissedAltText } from './recap-missed';
import { buildRecapReceipt, buildRecapReceiptStory, recapReceiptAltText } from './recap-receipt';
import { buildRecapRoute, buildRecapRouteStory, recapRouteAltText } from './recap-route';
import { buildRecapStamp, buildRecapStampStory, recapStampAltText } from './recap-stamp';

const statesDir = fileURLToPath(new URL('__states__/', import.meta.url));
const fontsDir = fileURLToPath(
  new URL('../../../../../apps/mobile/assets/fonts/', import.meta.url),
);

beforeAll(() => {
  registerFonts([
    { family: 'Archivo', bytes: new Uint8Array(readFileSync(`${fontsDir}Archivo-W66-800.ttf`)) },
    { family: 'Geist', bytes: new Uint8Array(readFileSync(`${fontsDir}Geist-400.ttf`)) },
    { family: 'GeistMono', bytes: new Uint8Array(readFileSync(`${fontsDir}GeistMono-400.ttf`)) },
    { family: 'Caveat', bytes: new Uint8Array(readFileSync(`${fontsDir}Caveat-600.ttf`)) },
  ]);
});

/**
 * Renders `layout` and compares it byte-for-byte against a committed golden PNG (writing one on
 * first run). Rendering is deterministic (no randomness, no clock/locale dependence), so an exact
 * match — not a fuzzy diff — is the right bar; a real change always changes the bytes, and a golden
 * that goes stale must be regenerated deliberately (delete the file, re-run) rather than silently
 * widened. Per the repo's own note on rasterizer determinism, these goldens are produced on macOS
 * and any CI job comparing them should stay macOS-only or tolerance-based.
 */
async function expectGolden(name: string, layout: CardLayout): Promise<void> {
  const bytes = await renderCardNode(layout);
  mkdirSync(statesDir, { recursive: true });
  const goldenPath = `${statesDir}${name}.png`;
  if (!existsSync(goldenPath)) writeFileSync(goldenPath, bytes);
  const golden = readFileSync(goldenPath);

  const decoded = await loadImage(Buffer.from(bytes));
  expect(decoded.width).toBe(layout.width);
  expect(decoded.height).toBe(layout.height);
  expect(Buffer.from(bytes).equals(golden)).toBe(true);
}

// Each case renders full-size cards through the real Node canvas backend (print size for the
// postcard), which takes seconds on a shared CI runner; give the suite a matching budget.
describe('share card templates (Node backend goldens)', { timeout: 60_000 }, () => {
  it('critter-card: post + story', async () => {
    await expectGolden('critter-card-post', buildCritterCard(critterCardFixture));
    await expectGolden('critter-card-story', buildCritterCardStory(critterCardFixture));
    expect(critterCardAltText(critterCardFixture)).toBe('Tokek, rare form, found in Bali');
  });

  it('recap-cover: post + story', async () => {
    await expectGolden('recap-cover-post', buildRecapCover(recapCoverFixture));
    await expectGolden('recap-cover-story', buildRecapCoverStory(recapCoverFixture));
    expect(recapCoverAltText(recapCoverFixture)).toContain('Vietnam & Indonesia');
  });

  it('recap-route: post + story', async () => {
    await expectGolden('recap-route-post', buildRecapRoute(recapRouteFixture));
    await expectGolden('recap-route-story', buildRecapRouteStory(recapRouteFixture));
    expect(recapRouteAltText(recapRouteFixture)).toContain('Hà Nội');
  });

  it('recap-awards: post + story', async () => {
    await expectGolden('recap-awards-post', buildRecapAwards(recapAwardsFixture));
    await expectGolden('recap-awards-story', buildRecapAwardsStory(recapAwardsFixture));
    expect(recapAwardsAltText(recapAwardsFixture)).toBe('Most Spotted: Tokek');
  });

  it('recap-receipt: post + story', async () => {
    await expectGolden('recap-receipt-post', buildRecapReceipt(recapReceiptFixture));
    await expectGolden('recap-receipt-story', buildRecapReceiptStory(recapReceiptFixture));
    expect(recapReceiptAltText(recapReceiptFixture)).toContain('$1,260');
  });

  it('recap-missed: post + story', async () => {
    await expectGolden('recap-missed-post', buildRecapMissed(recapMissedFixture));
    await expectGolden('recap-missed-story', buildRecapMissedStory(recapMissedFixture));
    expect(recapMissedAltText(recapMissedFixture)).toContain('Hạ Long');
  });

  it('recap-stamp: post + story', async () => {
    await expectGolden('recap-stamp-post', buildRecapStamp(recapStampFixture));
    await expectGolden('recap-stamp-story', buildRecapStampStory(recapStampFixture));
    expect(recapStampAltText(recapStampFixture)).toContain('Khánh');
  });

  it('postcard: front + back, screen + print', async () => {
    await expectGolden('postcard-front', buildPostcardFront(postcardFixture));
    await expectGolden('postcard-back', buildPostcardBack(postcardFixture));
    await expectGolden('postcard-front-print', buildPostcardFrontPrint(postcardFixture));
    await expectGolden('postcard-back-print', buildPostcardBackPrint(postcardFixture));
    expect(postcardAltText(postcardFixture)).toContain('Bali');
  });

  it('plan-preview: post only', async () => {
    await expectGolden('plan-preview-post', buildPlanPreview(planPreviewFixture));
    expect(planPreviewAltText(planPreviewFixture)).toContain('Weekend in Hội An');
  });

  it('memory: story only', async () => {
    await expectGolden('memory-story', buildMemoryStory(memoryFixture));
    expect(memoryAltText(memoryFixture)).toContain('a year ago');
  });

  it('poster: post only', async () => {
    await expectGolden('poster-post', buildPoster(posterFixture));
    expect(posterAltText(posterFixture)).toContain('Where next?');
  });
});
