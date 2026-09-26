import { describe, expect, it } from 'vitest';

import { emitCss } from '../codegen/css.js';
import { flattenForNative } from '../codegen/flatten.js';
import { emitKotlin } from '../codegen/kotlin.js';
import { emitSwift } from '../codegen/swift.js';
import { emitTs } from '../codegen/ts.js';
import { tokenDeclarations, tokens } from '../src/validate.js';

const leaves = flattenForNative(tokens, tokenDeclarations);
const ts = emitTs(tokens);
const css = emitCss(leaves);
const swift = emitSwift(leaves);
const kotlin = emitKotlin(leaves);

describe('generators produce stable output', () => {
  it('TS matches its snapshot', () => {
    expect(ts).toMatchSnapshot();
  });

  it('CSS matches its snapshot', () => {
    expect(css).toMatchSnapshot();
  });

  it('Swift matches its snapshot', () => {
    expect(swift).toMatchSnapshot();
  });

  it('Kotlin matches its snapshot', () => {
    expect(kotlin).toMatchSnapshot();
  });
});

describe('guide colours equal C5 across every output', () => {
  // design-system.md C5: tokek yellow, pon orange, lundi blue, ajo pink, sardi green.
  // (paco is the aliased "cream" case, documented in guide.tokens.json; not spot-checked here.)
  const c5 = {
    tokek: tokens.color.yellow,
    pon: tokens.color.orange,
    lundi: tokens.color.blue,
    ajo: tokens.color.pink,
    sardi: tokens.color.green.base,
  } as const;

  it.each(Object.entries(c5))('TS, CSS, Swift and Kotlin all carry guide.%s', (id, hex) => {
    expect(tokens.guide[id as keyof typeof c5]).toBe(hex);
    expect(ts).toContain(JSON.stringify(hex));
    expect(css).toContain(hex);
    expect(swift).toContain(hex);
    expect(kotlin).toContain(hex);
  });
});

describe('emitTs', () => {
  it('emits a const assertion consumers can import as a plain object', () => {
    expect(ts.startsWith('// Generated')).toBe(true);
    expect(ts).toContain('export const tokens = {');
    expect(ts.trimEnd().endsWith('} as const;')).toBe(true);
  });
});

describe('emitCss', () => {
  it('emits a single :root block with kebab-case custom properties', () => {
    expect(css).toMatch(/^\/\/ Generated[\s\S]*:root \{/);
    expect(css).toContain('--color-yellow: #ffd84a;');
    expect(css).toContain('--space-8: 8px;');
    expect(css).toContain('--motion-duration-base: 340ms;');
  });

  it('never emits a bare cpFormula value as a fixed length', () => {
    expect(css).not.toContain('height / 2');
  });
});

describe('emitSwift', () => {
  it('does not shadow SwiftUI.Color with a nested enum named Color', () => {
    expect(swift).not.toContain('public enum Color {');
    expect(swift).toContain('public enum Colors {');
  });

  it('parses colours through the generated Color(cpToken:) initializer', () => {
    expect(swift).toContain('extension Color');
    expect(swift).toContain('init(cpToken value: String)');
  });

  it('exposes a typography helper with a SwiftUI Font', () => {
    expect(swift).toContain('public struct CPTypography');
    expect(swift).toContain('var font: Font');
  });
});

describe('emitKotlin', () => {
  it('declares the CpTokens object in the design tokens package', () => {
    expect(kotlin).toContain('package app.critterpass.designtokens');
    expect(kotlin).toContain('object CpTokens {');
  });

  it('uses Compose Dp/TextUnit/CubicBezierEasing types', () => {
    expect(kotlin).toContain('import androidx.compose.ui.unit.Dp');
    expect(kotlin).toContain('import androidx.compose.ui.unit.TextUnit');
    expect(kotlin).toContain('import androidx.compose.animation.core.CubicBezierEasing');
  });
});
