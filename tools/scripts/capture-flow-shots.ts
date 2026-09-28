/** Which screenshots a Maestro flow took, and where `screens:capture` copies them. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Screenshot names a flow takes, from `takeScreenshot: name` or `takeScreenshot:\n  path: name`. */
export function screenshotNames(flowYaml: string): string[] {
  const names: string[] = [];
  const lines = flowYaml.split('\n');
  lines.forEach((line, index) => {
    const match = /^\s*-?\s*takeScreenshot:\s*(.*)$/.exec(line);
    if (!match) return;
    let value = (match[1] ?? '').replace(/\s+#.*$/, '').trim();
    if (!value) value = /^\s*path:\s*(.+)$/.exec(lines[index + 1] ?? '')?.[1]?.trim() ?? '';
    value = value.replace(/^['"]|['"]$/g, '').replace(/\.png$/, '');
    if (value) names.push(value);
  });
  return names;
}

export interface FlowScreens {
  flow: string;
  /** Directory Maestro ran in (screenshots land relative to it). */
  dir: string;
  names: string[];
}

/** Maps each expected screenshot to its output file; names shared across flows get the flow name as prefix. */
export function planCopies(results: FlowScreens[], out: string): { from: string; to: string }[] {
  const counts = new Map<string, number>();
  for (const { names } of results)
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return results.flatMap(({ flow, dir, names }) =>
    names.map((name) => {
      const flowName = path.basename(flow).replace(/\.ya?ml$/, '');
      const file = (counts.get(name) ?? 0) > 1 ? `${flowName}-${name}.png` : `${name}.png`;
      return { from: path.join(dir, `${name}.png`), to: path.join(out, file) };
    }),
  );
}

/**
 * Everything a flow's run wrote: the names its own `takeScreenshot` steps declare, plus every PNG in
 * the run directory (a subflow's names are built from its env, `${PREFIX}-3a-2-name`, so they are
 * only known once taken). A declared name that was never written stays in, so it is reported missing.
 */
export function flowScreenshotNames(flow: string, dir: string): string[] {
  const taken = readdirSync(dir)
    .filter((file) => file.endsWith('.png'))
    .map((file) => file.slice(0, -'.png'.length))
    .sort();
  return [...new Set([...screenshotNames(readFileSync(flow, 'utf8')), ...taken])];
}
