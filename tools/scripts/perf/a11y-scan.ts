/**
 * Accessibility scan: the declared colour contrast pairs, plus the view hierarchies a device run
 * saved (`maestro hierarchy > <screen>.json` after each journey screen, Android).
 *
 *   pnpm tsx tools/scripts/perf/a11y-scan.ts [--density 2.625] [--strict-targets] [hierarchy.json ...]
 *
 * In a hierarchy it reports every enabled, tappable node that neither it nor anything inside it
 * names (no text, accessibility text or hint), and every tappable node smaller than 44 points on
 * a side. Unnamed controls fail the run; small targets are listed for review, because the
 * hierarchy shows a view's frame without its `hitSlop` (`--strict-targets` fails on them too).
 * Android reports pixels: pass the device's density (pixels per dp). iOS hierarchies carry no
 * tappable flag, so they yield no findings here; VoiceOver is on the manual checklist in
 * docs/compliance/accessibility-audit.md. Without hierarchy files only contrast is checked.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { contrastPairs, contrastRatio } from '@cp/design-tokens';

export const MIN_TARGET_PT = 44;

export interface HierarchyNode {
  readonly attributes?: Readonly<Record<string, string | undefined>>;
  readonly children?: readonly HierarchyNode[];
}

export interface A11yFinding {
  readonly kind: 'unnamed' | 'small-target';
  /** Resource id when the node has one, else its bounds. */
  readonly node: string;
  readonly detail: string;
}

interface Rect {
  readonly width: number;
  readonly height: number;
}

/** `[left,top][right,bottom]` as Maestro prints it. */
export function parseBounds(bounds: string | undefined): Rect | undefined {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/u.exec(bounds ?? '');
  if (!m) return undefined;
  return { width: Number(m[3]) - Number(m[1]), height: Number(m[4]) - Number(m[2]) };
}

const NAME_KEYS = ['accessibilityText', 'text', 'hintText', 'title', 'value'] as const;

function named(node: HierarchyNode): boolean {
  if (NAME_KEYS.some((key) => (node.attributes?.[key] ?? '').trim() !== '')) return true;
  return (node.children ?? []).some(named);
}

export function scanHierarchy(root: HierarchyNode, density = 1): A11yFinding[] {
  const findings: A11yFinding[] = [];
  const visit = (node: HierarchyNode): void => {
    const attrs = node.attributes ?? {};
    const rect = parseBounds(attrs.bounds);
    const tappable = attrs.clickable === 'true' && attrs.enabled !== 'false';
    // A node without area is not on screen (recycled rows, collapsed sheets).
    if (tappable && rect && rect.width > 0 && rect.height > 0) {
      const id = attrs['resource-id'] || attrs.bounds || '?';
      if (!named(node)) findings.push({ kind: 'unnamed', node: id, detail: 'no text or label' });
      const width = Math.round(rect.width / density);
      const height = Math.round(rect.height / density);
      if (width < MIN_TARGET_PT || height < MIN_TARGET_PT) {
        findings.push({ kind: 'small-target', node: id, detail: `${width}×${height} pt` });
      }
    }
    (node.children ?? []).forEach(visit);
  };
  visit(root);
  return findings;
}

export function failingContrastPairs() {
  return contrastPairs
    .map((pair) => ({ ...pair, ratio: Math.round(contrastRatio(pair.fg, pair.bg) * 100) / 100 }))
    .filter((pair) => pair.ratio < pair.minRatio);
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      density: { type: 'string', default: '1' },
      'strict-targets': { type: 'boolean', default: false },
    },
  });
  const contrast = failingContrastPairs();
  console.log(`contrast: ${contrastPairs.length} declared pairs, ${contrast.length} below minimum`);
  for (const pair of contrast) console.log(`  ${pair.name}: ${pair.ratio} < ${pair.minRatio}`);

  let unnamed = 0;
  let small = 0;
  for (const file of positionals) {
    const root = JSON.parse(readFileSync(file, 'utf8')) as HierarchyNode;
    const findings = scanHierarchy(root, Number(values.density));
    unnamed += findings.filter((f) => f.kind === 'unnamed').length;
    small += findings.filter((f) => f.kind === 'small-target').length;
    console.log(`${file}: ${findings.length} findings`);
    for (const f of findings) console.log(`  ${f.kind}: ${f.node} (${f.detail})`);
  }
  if (positionals.length === 0) console.log('hierarchies: none given, screens not scanned');
  else
    console.log(`hierarchies: ${positionals.length} screens, ${unnamed} unnamed, ${small} small`);
  const failed = contrast.length > 0 || unnamed > 0 || (values['strict-targets'] && small > 0);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
