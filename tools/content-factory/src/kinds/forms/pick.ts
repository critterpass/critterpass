/**
 * Picks each recoloured form's palette from the model's options and the deterministic candidates:
 * the highest-scoring candidate that clears the hard rules (distinct from common, clear of tier
 * accents, gold for legendaries, distinct from the critter's other forms). Picks run per set so a
 * set's forms also spread out from each other.
 */
import { contrastRatio, deltaE2000 } from '../../color/color';
import { goldCandidates, isGold, rotatedCandidates, type ThreeSlot } from './palette-gen';

export const TIER_ACCENTS = ['#4f86ff', '#ff5fa8', '#ffd84a'] as const;
export const STICKER = '#fffdf6';
export const MIN_DE_FROM_COMMON = 18;
export const MIN_DE_BETWEEN_FORMS = 10;
export const MIN_DE_FROM_ACCENT = 6;

export type Recoloured = 'rare' | 'epic' | 'legendary';

export function nearAccent(palette: ThreeSlot): boolean {
  return [palette.f, palette.dk, palette.bl].some((slot) =>
    TIER_ACCENTS.some((accent) => deltaE2000(slot, accent) < MIN_DE_FROM_ACCENT),
  );
}

/** Hard rules a recoloured palette must meet against the common palette and sibling forms. */
export function paletteProblems(
  rarity: Recoloured,
  palette: ThreeSlot,
  common: ThreeSlot,
  siblings: readonly ThreeSlot[],
): string[] {
  const problems: string[] = [];
  if (rarity === 'legendary') {
    if (!isGold(palette.f)) problems.push('legendary fill is outside the gold family');
  } else {
    const distance = deltaE2000(palette.f, common.f);
    if (distance < MIN_DE_FROM_COMMON) {
      problems.push(
        `fill is only ΔE ${distance.toFixed(1)} from the common form (needs ${MIN_DE_FROM_COMMON})`,
      );
    }
    if (nearAccent(palette)) problems.push('a colour sits on a reserved tier accent');
    if (isGold(palette.f)) problems.push('the gold family is reserved for legendary forms');
  }
  for (const sibling of siblings) {
    const distance = deltaE2000(palette.f, sibling.f);
    if (distance < MIN_DE_BETWEEN_FORMS) {
      problems.push(`fill is only ΔE ${distance.toFixed(1)} from another form of this critter`);
    }
  }
  return problems;
}

function score(
  palette: ThreeSlot,
  common: ThreeSlot,
  setFills: readonly string[],
  fromModel: boolean,
): number {
  const fromCommon = Math.min(deltaE2000(palette.f, common.f), 50);
  const spread =
    setFills.length === 0 ? 30 : Math.min(30, ...setFills.map((f) => deltaE2000(palette.f, f)));
  const contrast = contrastRatio(palette.dk, STICKER) >= 3 ? 10 : 0;
  return fromCommon + spread + contrast + (fromModel ? 5 : 0);
}

export function pickPalette(
  id: string,
  rarity: Recoloured,
  common: ThreeSlot,
  modelOptions: readonly ThreeSlot[],
  siblings: readonly ThreeSlot[],
  setFills: readonly string[],
): ThreeSlot {
  const generated =
    rarity === 'legendary' ? goldCandidates(id) : rotatedCandidates(common, id, rarity === 'epic');
  const candidates = [
    ...modelOptions.map((palette) => ({ palette, fromModel: true })),
    ...generated.map((palette) => ({ palette, fromModel: false })),
  ].map((entry) => ({
    ...entry,
    ok: paletteProblems(rarity, entry.palette, common, siblings).length === 0,
    score: score(entry.palette, common, setFills, entry.fromModel),
  }));
  const valid = candidates.filter((entry) => entry.ok);
  const pool = valid.length > 0 ? valid : candidates;
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  const lower = (p: ThreeSlot): ThreeSlot => ({
    f: p.f.toLowerCase(),
    dk: p.dk.toLowerCase(),
    bl: p.bl.toLowerCase(),
  });
  return lower(best.palette);
}
