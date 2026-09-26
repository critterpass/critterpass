/**
 * Emits `apps/web/src/styles/fonts.css`: one `@font-face` per bundled weight/width, sharing a
 * single `font-family` name per family (unlike the mobile side, where each weight/width registers
 * as its own standalone family to avoid RN/OS style-linking — the browser's own font matching by
 * `font-weight`/`font-stretch` makes that unnecessary here, and `tokens.css`'s
 * `--type-*-font-family` values already assume these shared names).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_HEADER } from './generated-header.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_PATH = join(packageRoot, '../../tools/scripts/fonts/sources.json');

interface FontSources {
  readonly unicodeRangeDefinitions: Readonly<Record<string, readonly string[]>>;
  readonly families: Readonly<Record<string, FamilySource>>;
}

interface FamilySource {
  readonly displayName: string;
  readonly variable?: boolean;
  readonly axes?: { readonly wdth?: readonly number[]; readonly wght: readonly number[] };
  readonly staticSources?: readonly { readonly weight: number }[];
  readonly unicodeRanges: readonly string[];
  readonly targets: readonly string[];
}

const CSS_FAMILY_NAME: Record<string, string> = {
  archivo: 'Archivo',
  geist: 'Geist',
  geistMono: 'Geist Mono',
  caveat: 'Caveat',
  instrumentSerif: 'Instrument Serif',
  notoSansThai: 'Noto Sans Thai',
};

interface FontFaceEntry {
  readonly family: string;
  readonly weight: number;
  readonly stretchPercent: number | undefined;
  readonly fileStem: string;
  readonly unicodeRange: string;
}

function unicodeRangeFor(sources: FontSources, rangeNames: readonly string[]): string {
  return rangeNames.flatMap((name) => sources.unicodeRangeDefinitions[name] ?? []).join(', ');
}

function entriesForFamily(name: string, spec: FamilySource, sources: FontSources): FontFaceEntry[] {
  const family = CSS_FAMILY_NAME[name] ?? spec.displayName;
  const unicodeRange = unicodeRangeFor(sources, spec.unicodeRanges);

  if (spec.variable && spec.axes) {
    const widths = spec.axes.wdth ?? [undefined];
    const varyStretch = widths.length > 1;
    const entries: FontFaceEntry[] = [];
    for (const width of widths) {
      for (const weight of spec.axes.wght) {
        const fileStem = width !== undefined && varyStretch ? `Archivo-W${width}-${weight}` : `${spec.displayName.replace(/ /g, '')}-${weight}`;
        entries.push({ family, weight, stretchPercent: varyStretch ? width : undefined, fileStem, unicodeRange });
      }
    }
    return entries;
  }

  return (spec.staticSources ?? []).map(({ weight }) => ({
    family,
    weight,
    stretchPercent: undefined,
    fileStem: `${spec.displayName.replace(/ /g, '')}-${weight}`,
    unicodeRange,
  }));
}

function fontFaceRule(entry: FontFaceEntry): string {
  const stretch = entry.stretchPercent !== undefined ? `\n  font-stretch: ${entry.stretchPercent}%;` : '';
  return `@font-face {
  font-family: '${entry.family}';
  src: url('/fonts/${entry.fileStem}.woff2') format('woff2');
  font-weight: ${entry.weight};
  font-style: normal;${stretch}
  font-display: swap;
  unicode-range: ${entry.unicodeRange};
}`;
}

export function emitFontsCss(): string {
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8')) as FontSources;
  const rules = Object.entries(sources.families)
    .filter(([, spec]) => spec.targets.includes('web'))
    .flatMap(([name, spec]) => entriesForFamily(name, spec, sources))
    .map(fontFaceRule);
  return `${GENERATED_HEADER}\n\n${rules.join('\n\n')}\n`;
}
