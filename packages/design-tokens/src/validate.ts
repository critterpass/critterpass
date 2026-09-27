/**
 * Loads every `*.tokens.json` source file, resolves aliases, validates each declared token
 * against its `$type` schema, splices in the computed guide `onPaper` variants, and exports the
 * final `tokens` tree plus `contrastPairs`. Runs once at module import time: a malformed token
 * source fails the import immediately rather than shipping a broken value.
 */
import colorTokens from './color.tokens.json';
import type { ContrastPair } from './contrast';
import { buildContrastPairs, computeGuideColors, guideOnPaperRecord } from './derive';
import guideTokens from './guide.tokens.json';
import memberTokens from './member.tokens.json';
import motionTokens from './motion.tokens.json';
import radiusTokens from './radius.tokens.json';
import ringTokens from './ring.tokens.json';
import type { RawTree } from './resolve';
import { mergeRawTrees, resolveTokenTree } from './resolve';
import { validateDeclarations } from './schema';
import semanticTokens from './semantic.tokens.json';
import shadowTokens from './shadow.tokens.json';
import sizeTokens from './size.tokens.json';
import soundTokens from './sound.tokens.json';
import spaceTokens from './space.tokens.json';
import textureTokens from './texture.tokens.json';
import tierTokens from './tier.tokens.json';
import typeTokens from './type.tokens.json';
import type { DeclaredToken } from './resolve';
import type { Tokens } from './types';

// Each *.tokens.json's own top-level key already names its category (docs/design-system.md §1);
// merging is a plain union of those 14 keys.
const RAW_SOURCE_FILES: readonly RawTree[] = [
  colorTokens,
  semanticTokens,
  guideTokens,
  tierTokens,
  memberTokens,
  spaceTokens,
  sizeTokens,
  radiusTokens,
  ringTokens,
  shadowTokens,
  textureTokens,
  typeTokens,
  motionTokens,
  soundTokens,
];

const mergedRaw = mergeRawTrees(RAW_SOURCE_FILES);
const { tree: resolvedTree, declarations } = resolveTokenTree(mergedRaw);

validateDeclarations(declarations);

const guideColors = computeGuideColors(resolvedTree);
const guideTree = resolvedTree['guide'];
if (typeof guideTree !== 'object' || guideTree === null || Array.isArray(guideTree)) {
  throw new Error('design-tokens: resolved tree is missing the "guide" category');
}
const augmentedTree: Record<string, unknown> = {
  ...resolvedTree,
  guide: { ...guideTree, onPaper: guideOnPaperRecord(guideColors) },
};

/** The fully resolved token tree (docs/design-system.md §1, §3.2-3.3, §4). See `Tokens` for its shape. */
export const tokens = augmentedTree as unknown as Tokens;

export type { Tokens } from './types';

/** Declared contrast pairs checked by test/contrast.test.ts and reusable by consumers/tooling. */
export const contrastPairs: readonly ContrastPair[] = buildContrastPairs(resolvedTree, guideColors);

/** Flat `{path, type, value}` view of every token as declared in the DTCG source (for generators). */
export const tokenDeclarations: readonly DeclaredToken[] = declarations;
