import { describe, expect, it } from 'vitest';

import { resolveMemberStyle } from '../src/member';
import type { RawTree } from '../src/resolve';
import { mergeRawTrees, resolveTokenTree } from '../src/resolve';
import { isKnownTokenType, tokenSchemas, validateDeclarations } from '../src/schema';
import { resolveTypeVariant } from '../src/type-variant';
import { tokenDeclarations, tokens } from '../src/validate';

describe('resolveTokenTree (alias resolution)', () => {
  it('resolves a same-file alias to its target value', () => {
    const tree: RawTree = {
      a: { base: { $type: 'color', $value: '#111111' } },
      b: { copy: { $type: 'color', $value: '{a.base}' } },
    };
    const { tree: resolved } = resolveTokenTree(tree);
    expect(resolved).toEqual({ a: { base: '#111111' }, b: { copy: '#111111' } });
  });

  it('resolves a chain of aliases across categories', () => {
    const tree: RawTree = {
      a: { base: { $type: 'color', $value: '#222222' } },
      b: { mid: { $type: 'color', $value: '{a.base}' } },
      c: { leaf: { $type: 'color', $value: '{b.mid}' } },
    };
    const { tree: resolved } = resolveTokenTree(tree);
    expect(resolved).toEqual({
      a: { base: '#222222' },
      b: { mid: '#222222' },
      c: { leaf: '#222222' },
    });
  });

  it('resolves aliases nested inside arrays and objects', () => {
    const tree: RawTree = {
      a: { hue: { $type: 'color', $value: '#333333' } },
      list: { $type: 'cpList', $value: ['{a.hue}', 'literal'] },
      group: { $type: 'cpRing', $value: { widthPt: 2, color: '{a.hue}' } },
    };
    const { tree: resolved } = resolveTokenTree(tree);
    expect(resolved['list']).toEqual(['#333333', 'literal']);
    expect(resolved['group']).toEqual({ widthPt: 2, color: '#333333' });
  });

  it('throws on a direct alias cycle', () => {
    const tree: RawTree = {
      a: { $type: 'color', $value: '{b}' },
      b: { $type: 'color', $value: '{a}' },
    };
    expect(() => resolveTokenTree(tree)).toThrow(/cycle/);
  });

  it('throws when an alias points nowhere', () => {
    const tree: RawTree = { a: { $type: 'color', $value: '{missing.path}' } };
    expect(() => resolveTokenTree(tree)).toThrow(/unresolved alias/);
  });

  it('throws when an alias points at a group instead of a token', () => {
    const tree: RawTree = {
      group: { child: { $type: 'color', $value: '#444444' } },
      ref: { $type: 'color', $value: '{group}' },
    };
    expect(() => resolveTokenTree(tree)).toThrow(/points to a group/);
  });

  it('throws on a token missing $type (never silently drops it)', () => {
    const tree = { a: { $value: '#555555' } } as unknown as RawTree;
    expect(() => resolveTokenTree(tree)).toThrow(/malformed token/);
  });

  it('throws when a raw node is a bare primitive instead of a token or group', () => {
    const tree = { a: 5 } as unknown as RawTree;
    expect(() => resolveTokenTree(tree)).toThrow(/expected a token or a group/);
  });
});

describe('mergeRawTrees', () => {
  it('deep-merges sibling categories from separate files', () => {
    const merged = mergeRawTrees([
      { color: { a: { $type: 'color', $value: '#111' } } },
      { semantic: { b: { $type: 'color', $value: '#222' } } },
    ]);
    expect(Object.keys(merged).sort()).toEqual(['color', 'semantic']);
  });

  it('deep-merges nested groups within the same top-level category', () => {
    const merged = mergeRawTrees([
      { color: { a: { $type: 'color', $value: '#111' } } },
      { color: { b: { $type: 'color', $value: '#222' } } },
    ]);
    expect(merged['color']).toEqual({
      a: { $type: 'color', $value: '#111' },
      b: { $type: 'color', $value: '#222' },
    });
  });
});

describe('validateDeclarations', () => {
  it('accepts a value matching its declared $type', () => {
    expect(() => validateDeclarations([{ path: 'x', type: 'dimension', value: 8 }])).not.toThrow();
  });

  it('rejects a value that does not match its declared $type', () => {
    expect(() => validateDeclarations([{ path: 'x', type: 'dimension', value: 'eight' }])).toThrow(
      /invalid token/,
    );
  });

  it('rejects an unknown $type', () => {
    expect(() => validateDeclarations([{ path: 'x', type: 'notAType', value: 1 }])).toThrow(
      /unknown \$type/,
    );
  });

  it('rejects a colour value that is not hex or rgba()', () => {
    expect(() => validateDeclarations([{ path: 'x', type: 'color', value: 'cream' }])).toThrow(
      /invalid token/,
    );
  });
});

describe('the real token source', () => {
  it('declares every token with a $type this package recognises', () => {
    for (const decl of tokenDeclarations) {
      expect(isKnownTokenType(decl.type), `${decl.path} has unknown $type "${decl.type}"`).toBe(
        true,
      );
    }
  });

  it('has every DTCG-registered $type schema exercised by at least one real token, or is unused by design', () => {
    // Guards the schema registry itself from silently drifting from the source files.
    const usedTypes = new Set(tokenDeclarations.map((d) => d.type));
    const unusedButExpected = new Set(['string', 'number']); // reserved for future categories
    for (const type of Object.keys(tokenSchemas)) {
      if (!usedTypes.has(type))
        expect(unusedButExpected.has(type), `schema "${type}" is unused`).toBe(true);
    }
  });

  it('has the 14 top-level categories from design-system.md §1, §3.2-3.3, §4', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      [
        'color',
        'guide',
        'member',
        'motion',
        'radius',
        'ring',
        'semantic',
        'shadow',
        'size',
        'sound',
        'space',
        'texture',
        'tier',
        'type',
      ].sort(),
    );
  });

  it('matches the canonical guide colours exactly', () => {
    expect(tokens.guide.tokek).toBe(tokens.color.yellow);
    expect(tokens.guide.pon).toBe(tokens.color.orange);
    expect(tokens.guide.lundi).toBe(tokens.color.blue);
    expect(tokens.guide.ajo).toBe(tokens.color.pink);
    expect(tokens.guide.sardi).toBe(tokens.color.green.base);
    expect(tokens.guide.order).toEqual(['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco']);
  });

  it('matches the tier colours exactly', () => {
    expect(tokens.tier.rare.color).toBe('#4f86ff');
    expect(tokens.tier.epic.color).toBe('#ff5fa8');
    expect(tokens.tier.legendary.color).toBe('#ffd84a');
    expect(tokens.tier.epic.edge).toEqual({ widthPt: 2, color: '#ff5fa8' });
    expect(tokens.tier.legendary.edge).toEqual({ widthPt: 3, color: '#ffd84a' });
  });

  it('matches the space scale exactly', () => {
    expect(
      Object.keys(tokens.space)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32]);
  });

  it('matches motion durations and easings exactly', () => {
    expect(tokens.motion.duration.base).toBe(340);
    expect(tokens.motion.duration.story).toBe(5000);
    expect(tokens.motion.easing.standard).toEqual([0.32, 0.72, 0, 1]);
    expect(tokens.motion.spring.snappy).toEqual({
      kind: 'physical',
      stiffness: 420,
      damping: 26,
      mass: 1,
      overshootPercent: 8,
    });
  });

  it('gives member.colors exactly the 6 join-order accents and 3 ring patterns', () => {
    expect(tokens.member.colors).toHaveLength(6);
    expect(tokens.member.ringPatterns).toEqual(['solid', 'dashed', 'double']);
  });

  it('never lets an informational typography variant drop below the 11pt floor (§1.3)', () => {
    for (const [path, variant] of Object.entries({
      eyebrow: tokens.type.eyebrow,
      label: tokens.type.label,
      caption: tokens.type.caption,
    })) {
      const smallest = variant.fontSize ?? variant.fontSizeMin;
      expect(smallest, path).toBeDefined();
      expect(smallest ?? 0, path).toBeGreaterThanOrEqual(11);
    }
  });
});

describe('resolveTypeVariant', () => {
  it('uses the declared fontSize as-is at 100% scale', () => {
    const resolved = resolveTypeVariant(tokens.type.title);
    expect(resolved.fontSize).toBe(16);
    expect(resolved.lineHeight).toBe(16);
    expect(resolved.textTransform).toBe('uppercase');
  });

  it('defaults an auto-fit range with no fixed fontSize to its fontSizeMax', () => {
    const resolved = resolveTypeVariant(tokens.type.display.hero);
    expect(resolved.fontSize).toBe(90);
  });

  it('scales body text fully up to the 200% ceiling', () => {
    const resolved = resolveTypeVariant(tokens.type.body.base, { fontScale: 2 });
    expect(resolved.fontSize).toBeCloseTo(28, 5);
  });

  it('clamps body text scaling at the 200% ceiling even if the OS reports more', () => {
    const resolved = resolveTypeVariant(tokens.type.body.base, { fontScale: 3 });
    expect(resolved.fontSize).toBeCloseTo(28, 5);
  });

  it('dampens h1 to a 0.5x factor', () => {
    const resolved = resolveTypeVariant(tokens.type.h1, { fontScale: 2 });
    // base 44 * (1 + (2-1)*0.5) = 44 * 1.5
    expect(resolved.fontSize).toBeCloseTo(66, 5);
    expect(resolved.maxLines).toBe(3);
  });

  it('floors h1 at its 0.7x minScale when the OS scale is well below 1', () => {
    // dampened = 1 + (0.2 - 1) * 0.5 = 0.6, below the 0.7 floor, so the floor wins.
    const resolved = resolveTypeVariant(tokens.type.h1, { fontScale: 0.2 });
    expect(resolved.fontSize).toBeCloseTo(44 * 0.7, 5);
  });

  it('converts letterSpacing from em to points using the resolved font size', () => {
    const resolved = resolveTypeVariant(tokens.type.button.lg);
    expect(resolved.letterSpacing).toBeCloseTo(16 * 0.06, 5);
  });

  it('rejects a non-positive fontScale', () => {
    expect(() => resolveTypeVariant(tokens.type.body.base, { fontScale: 0 })).toThrow(/fontScale/);
  });
});

describe('resolveMemberStyle', () => {
  it('assigns the first 6 members solid unique colours in join order', () => {
    const styles = [0, 1, 2, 3, 4, 5].map(resolveMemberStyle);
    expect(styles.every((s) => s.pattern === 'solid')).toBe(true);
    expect(new Set(styles.map((s) => s.color)).size).toBe(6);
  });

  it('cycles to the dashed pattern for members 7-12, reusing the same colour order', () => {
    const first = resolveMemberStyle(0);
    const seventh = resolveMemberStyle(6);
    expect(seventh.pattern).toBe('dashed');
    expect(seventh.color).toBe(first.color);
  });

  it('cycles to the double pattern for members 13-16', () => {
    const style = resolveMemberStyle(13);
    expect(style.pattern).toBe('double');
  });

  it('rejects a negative or non-integer join index', () => {
    expect(() => resolveMemberStyle(-1)).toThrow(/non-negative integer/);
    expect(() => resolveMemberStyle(1.5)).toThrow(/non-negative integer/);
  });
});
