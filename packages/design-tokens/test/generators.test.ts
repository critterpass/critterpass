import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildAndroidFonts } from '../codegen/android-fonts.js';
import { emitCss } from '../codegen/css.js';
import { flattenForNative } from '../codegen/flatten.js';
import { emitFontsCss } from '../codegen/fonts-css.js';
import { emitKotlin } from '../codegen/kotlin.js';
import { emitSwift } from '../codegen/swift.js';
import { emitTs } from '../codegen/ts.js';
import { tokenDeclarations, tokens } from '../src/validate.js';

const leaves = flattenForNative(tokens, tokenDeclarations);
const ts = emitTs(tokens);
const css = emitCss(leaves);
const swift = emitSwift(leaves);
const kotlin = emitKotlin(leaves);
const fontsCss = emitFontsCss();

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

describe('guide colours match the canonical palette in every output', () => {
  // Canonical guide colours: tokek yellow, pon orange, lundi blue, ajo pink, sardi green.
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

describe('emitFontsCss', () => {
  it('matches its snapshot', () => {
    expect(fontsCss).toMatchSnapshot();
  });

  it('shares one font-family name across every Archivo weight/width, unlike the mobile side', () => {
    const archivoRules = fontsCss.split('@font-face').filter((rule) => rule.includes("font-family: 'Archivo'"));
    expect(archivoRules.length).toBe(15); // 5 widths x 3 weights
    expect(fontsCss).toContain('font-stretch: 62%;');
    expect(fontsCss).toContain('font-stretch: 100%;');
  });

  it('gives every rule a unicode-range and a woff2 src', () => {
    const ruleCount = (fontsCss.match(/@font-face/g) ?? []).length;
    const rangeCount = (fontsCss.match(/unicode-range:/g) ?? []).length;
    expect(ruleCount).toBeGreaterThan(0);
    expect(rangeCount).toBe(ruleCount);
    expect(fontsCss).toContain("format('woff2')");
  });

  it('excludes Instrument Serif’s mobile-only sibling but includes the family itself (web-only target)', () => {
    expect(fontsCss).toContain("font-family: 'Instrument Serif'");
  });
});

describe('buildAndroidFonts', () => {
  it('copies every bundled ttf and writes a matching font-family XML wrapper', () => {
    const written = buildAndroidFonts();
    expect(written.length).toBeGreaterThan(0);
    expect(written.length % 2).toBe(0);

    const outputDir = join(import.meta.dirname, '../generated/android/res/font');
    const xml = readFileSync(join(outputDir, 'archivo_w70_900_family.xml'), 'utf8');
    expect(xml).toContain('app:font="@font/archivo_w70_900"');
    expect(xml).toContain('app:fontWeight="900"');
    expect(() => readFileSync(join(outputDir, 'archivo_w70_900.ttf'))).not.toThrow();
  });
});
