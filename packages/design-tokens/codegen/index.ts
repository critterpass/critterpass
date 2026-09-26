/// <reference types="node" />
/**
 * CLI entry (`pnpm --filter @cp/design-tokens run build`): writes every generated output from the
 * one resolved token source. TS/Swift/Kotlin go to `generated/` (gitignored, cross-language build
 * output); the web CSS is a committed source file the web app imports directly. The package's
 * tsconfig keeps `types: []` so the leaf `src/` runtime never sees ambient Node globals; this one
 * Node-only build script opts back in with a local reference instead.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenDeclarations, tokens } from '../src/validate.js';
import { buildAndroidFonts } from './android-fonts.js';
import { emitCss } from './css.js';
import { flattenForNative } from './flatten.js';
import { emitFontsCss } from './fonts-css.js';
import { emitKotlin } from './kotlin.js';
import { emitSwift } from './swift.js';
import { emitTs } from './ts.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function write(relativePath: string, contents: string): void {
  const fullPath = join(packageRoot, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, 'utf8');
  console.log(`wrote ${relativePath} (${contents.length} bytes)`);
}

function copy(fromRelative: string, toRelative: string): void {
  const from = join(packageRoot, fromRelative);
  const to = join(packageRoot, toRelative);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${fromRelative} -> ${toRelative}`);
}

function main(): void {
  const leaves = flattenForNative(tokens, tokenDeclarations);

  write('generated/ts/tokens.ts', emitTs(tokens));
  write('generated/swift/CPTokens.swift', emitSwift(leaves));
  write('generated/kotlin/CpTokens.kt', emitKotlin(leaves));
  write('../../apps/web/src/styles/tokens.css', emitCss(leaves));

  copy('swift/CPFont.swift', 'generated/swift/CPFont.swift');
  const androidFontFiles = buildAndroidFonts();
  console.log(`wrote ${androidFontFiles.length} Android font resource(s)`);
  write('../../apps/web/src/styles/fonts.css', emitFontsCss());
}

main();
