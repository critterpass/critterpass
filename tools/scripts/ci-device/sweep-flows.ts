/**
 * Generates the UI sweep's flows under `e2e/sweep/` from the manifest (./sweep-manifest).
 *
 *   tsx tools/scripts/ci-device/sweep-flows.ts --write    regenerate e2e/sweep/*.yaml
 *   tsx tools/scripts/ci-device/sweep-flows.ts            say which files are out of date
 *
 * One flow per lab and per seed, per language. A lab flow opens its lab from a fresh launch
 * (`subflows/open-lab.yaml`) and runs `subflows/lab-scene.yaml` once per scene; a seed flow starts
 * its account and runs its steps (`subflows/seed-<name>.yaml`). Edit the manifest or the subflows,
 * never the generated files: `sweep-flows.test.ts` fails while they differ.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { LABS, LANGUAGES, SEEDS, SWEEP_DIR, type Lab, type Seed } from './sweep-manifest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const GENERATED =
  'Generated from tools/scripts/ci-device/sweep-manifest.json (sweep-flows.ts --write).';

/** A scalar Maestro reads as that exact text: quoted unless it is a plain word. */
function scalar(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
}

function runFlow(file: string, env: Readonly<Record<string, string>>): string[] {
  const entries = Object.entries(env);
  if (entries.length === 0) return [`- runFlow: ${file}`];
  return [
    '- runFlow:',
    `    file: ${file}`,
    '    env:',
    ...entries.map(([name, value]) => `      ${name}: ${scalar(value)}`),
  ];
}

export function renderLabFlow(lab: Lab, lang: string): string {
  return [
    'appId: app.critterpass.dev',
    // Every subflow reads the lab from here.
    'env:',
    `  LANG: ${lang}`,
    // A lab drawn in Developer tools' own list has no entry to tap: open-lab.yaml never reads it.
    `  NAV: ${scalar(lab.nav || 'none')}`,
    `  LIST: ${scalar(lab.list)}`,
    '---',
    `# UI sweep (${lang}), lab scenes: ${lab.summary}.`,
    `# ${GENERATED}`,
    '- runFlow: subflows/open-lab.yaml',
    ...lab.scenes.flatMap((scene) =>
      runFlow('subflows/lab-scene.yaml', {
        ITEM: scene.item,
        READY: scene.ready,
        SHOT: `${lang}-${scene.shot}`,
      }),
    ),
    '',
  ].join('\n');
}

export function renderSeedFlow(seed: Seed, lang: string): string {
  const start =
    seed.start === 'fresh' || seed.start === 'onboard'
      ? [
          ...runFlow('subflows/start.yaml', { LANG: lang }),
          ...(seed.start === 'onboard' ? ['- runFlow: ../home/subflows/onboard.yaml'] : []),
        ]
      : runFlow('../_shared/start-as.yaml', { SCENARIO: seed.start, LANG: lang });
  return [
    'appId: app.critterpass.dev',
    '---',
    `# UI sweep (${lang}): ${seed.summary}.`,
    `# ${GENERATED}`,
    ...start,
    ...runFlow(`subflows/seed-${seed.name}.yaml`, { LANG: lang }),
    '',
  ].join('\n');
}

/** Every generated file, repo-root-relative, with its text. */
export function generatedFlows(): { file: string; text: string }[] {
  return LANGUAGES.flatMap((lang) => [
    ...SEEDS.map((seed) => ({
      file: `${SWEEP_DIR}/seed-${seed.name}-${lang}.yaml`,
      text: renderSeedFlow(seed, lang),
    })),
    ...LABS.map((lab) => ({
      file: `${SWEEP_DIR}/lab-${lab.name}-${lang}.yaml`,
      text: renderLabFlow(lab, lang),
    })),
  ]);
}

/** Generated files that are missing or differ, and top-level flows the manifest no longer has. */
export function staleFlows(root: string): string[] {
  const wanted = generatedFlows();
  const names = new Set(wanted.map(({ file }) => path.basename(file)));
  const dir = path.join(root, SWEEP_DIR);
  const strays = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((name) => name.endsWith('.yaml') && !names.has(name))
    .map((name) => `${SWEEP_DIR}/${name}`);
  const changed = wanted
    .filter(({ file, text }) => {
      const at = path.join(root, file);
      return !existsSync(at) || readFileSync(at, 'utf8') !== text;
    })
    .map(({ file }) => file);
  return [...changed, ...strays];
}

/**
 * The screenshot names (without language) a steps subflow takes, following the subflows it runs:
 * `${LANG}-…` and `${PREFIX}-…`, taken directly or handed on as `SHOT`.
 */
export function stepShots(root: string, file: string, seen = new Set<string>()): string[] {
  if (seen.has(file) || !existsSync(path.join(root, file))) return [];
  seen.add(file);
  const text = readFileSync(path.join(root, file), 'utf8');
  const own = [...text.matchAll(/(?:takeScreenshot|SHOT):\s*['"]?\$\{(?:LANG|PREFIX)\}-([\w-]+)/g)];
  const refs = [...text.matchAll(/(?:runFlow|file):\s*([\w./-]+\.yaml)/g)];
  return [
    ...own.map((match) => match[1] ?? ''),
    ...refs.flatMap((match) =>
      stepShots(root, path.normalize(path.join(path.dirname(file), match[1] ?? '')), seen),
    ),
  ];
}

function main(): void {
  if (!process.argv.includes('--write')) {
    const stale = staleFlows(REPO_ROOT);
    console.log(stale.length ? `Out of date:\n${stale.join('\n')}` : 'e2e/sweep is up to date');
    process.exitCode = stale.length ? 1 : 0;
    return;
  }
  const stale = staleFlows(REPO_ROOT);
  const wanted = new Map(generatedFlows().map(({ file, text }) => [file, text]));
  for (const file of stale) {
    const text = wanted.get(file);
    if (text === undefined) rmSync(path.join(REPO_ROOT, file));
    else writeFileSync(path.join(REPO_ROOT, file), text);
  }
  console.log(
    `e2e/sweep: ${String(wanted.size)} flows, ${String(stale.length)} written or removed`,
  );
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
