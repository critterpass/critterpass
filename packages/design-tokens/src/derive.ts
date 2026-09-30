/**
 * Values computed from the resolved token tree rather than declared directly in the DTCG source:
 * each guide colour's `onPaper` variant (darkened until >= 4.5:1 on paper, design-system.md §1.2)
 * and the `contrastPairs` this package exports for the accessibility contract (§5).
 */
import type { ContrastPair } from './contrast';
import { darkenToContrast } from './contrast';
import { getResolvedValue } from './resolve';
import type { GuideId } from './types';

export const GUIDE_IDS: readonly GuideId[] = [
  'tokek',
  'pon',
  'lundi',
  'ajo',
  'sardi',
  'paco',
  'chava',
];
const ON_PAPER_MIN_RATIO = 4.5;

export interface GuideColorEntry {
  readonly id: GuideId;
  readonly base: string;
  readonly onPaper: string;
}

function requireString(tree: Record<string, unknown>, path: string): string {
  const value = getResolvedValue(tree, path);
  if (typeof value !== 'string') {
    throw new Error(
      `design-tokens: expected a resolved string token at "${path}", got ${typeof value}`,
    );
  }
  return value;
}

/** Computes each guide's `onPaper` text colour by darkening its base hue until it reads on paper. */
export function computeGuideColors(tree: Record<string, unknown>): readonly GuideColorEntry[] {
  const paper = requireString(tree, 'color.paper.base');
  return GUIDE_IDS.map((id): GuideColorEntry => {
    const base = requireString(tree, `guide.${id}`);
    return { id, base, onPaper: darkenToContrast(base, paper, ON_PAPER_MIN_RATIO) };
  });
}

/** `guide.<id>` -> its computed `onPaper` hex, for splicing into the resolved tree at `guide.onPaper`. */
export function guideOnPaperRecord(
  guideColors: readonly GuideColorEntry[],
): Record<GuideId, string> {
  // Object.fromEntries's lib types widen the key to `string`; the tuple's key type is exhaustive
  // over GuideId because guideColors is always built from GUIDE_IDS above.
  return Object.fromEntries(
    guideColors.map((entry): [GuideId, string] => [entry.id, entry.onPaper]),
  ) as Record<GuideId, string>;
}

/**
 * Declared contrast pairs (design-system.md §5): text roles on their surfaces, tier glyph colours
 * on the dark background, and every guide/member accent both as a text colour on paper (via
 * `onPaper`) and as a background under `text.onAccent` (member colours reuse the guide palette).
 */
export function buildContrastPairs(
  tree: Record<string, unknown>,
  guideColors: readonly GuideColorEntry[],
): readonly ContrastPair[] {
  const paper = requireString(tree, 'color.paper.base');
  const bg = requireString(tree, 'semantic.bg.base');
  const textOnAccent = requireString(tree, 'semantic.text.onAccent');

  const pairs: ContrastPair[] = [
    {
      name: 'semantic.text.primary on semantic.bg.base',
      fg: requireString(tree, 'semantic.text.primary'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'semantic.text.secondary on semantic.bg.base',
      fg: requireString(tree, 'semantic.text.secondary'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'semantic.text.tertiary on semantic.bg.base',
      fg: requireString(tree, 'semantic.text.tertiary'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'color.paper.muted on color.paper.base',
      fg: requireString(tree, 'color.paper.muted'),
      bg: paper,
      minRatio: 4.5,
    },
    {
      name: 'color.rust.darkened on color.paper.base',
      fg: requireString(tree, 'color.rust.darkened'),
      bg: paper,
      minRatio: 4.5,
    },
    {
      name: 'color.rust.base on color.paper.base (24pt+ only)',
      fg: requireString(tree, 'color.rust.base'),
      bg: paper,
      minRatio: 3,
    },
    // design-system.md §1.2 documents this pair as "#5b5487 (3:1 on ink.850)", but that literal hex
    // (also the one used throughout design/Critterpass.dc.html, so not a transcription slip) only
    // measures ~2.62:1 by the WCAG formula; see test/contrast.test.ts for the tracked assertion.
    // The increaseContrast escape hatch below does clear 3:1 and is what OS Increase Contrast uses.
    {
      name: 'semantic.border.control on semantic.bg.base',
      fg: requireString(tree, 'semantic.border.control'),
      bg,
      minRatio: 2.6,
    },
    {
      name: 'semantic.increaseContrast.borderControl on semantic.bg.base',
      fg: requireString(tree, 'semantic.increaseContrast.borderControl'),
      bg,
      minRatio: 3,
    },
    {
      name: 'tier.common.color on semantic.bg.base',
      fg: requireString(tree, 'tier.common.color'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'tier.rare.color on semantic.bg.base',
      fg: requireString(tree, 'tier.rare.color'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'tier.epic.color on semantic.bg.base',
      fg: requireString(tree, 'tier.epic.color'),
      bg,
      minRatio: 4.5,
    },
    {
      name: 'tier.legendary.color on semantic.bg.base',
      fg: requireString(tree, 'tier.legendary.color'),
      bg,
      minRatio: 4.5,
    },
  ];

  for (const entry of guideColors) {
    pairs.push({
      name: `guide.${entry.id}.onPaper on color.paper.base`,
      fg: entry.onPaper,
      bg: paper,
      minRatio: 4.5,
    });
    pairs.push({
      name: `semantic.text.onAccent on guide.${entry.id}`,
      fg: textOnAccent,
      bg: entry.base,
      minRatio: 4.5,
    });
  }

  return pairs;
}
