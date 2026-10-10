/**
 * The UI sweep's manifest (`sweep-manifest.json`): every screenshot the sweep takes, and how to get
 * there. The flows under `e2e/sweep/` are generated from it (./sweep-flows), the run summary counts
 * its screenshots against the ones a run captured (./sweep-result), and the coverage report reads
 * the design ids its screenshots are named for (./sweep-coverage).
 *
 * A **lab** is one Developer tools entry (`nav`) whose screen lists scenes drawn from fixtures. Each
 * scene is one line, `row | ready | shot`: the list row's id without the lab's `rows` prefix, an id
 * only the drawn scene shows, and the screenshot's name without its language. `list` is an id only
 * the lab's list shows (by default any row). A lab without a `nav` has Developer tools itself as
 * its list: its scenes are entries there.
 *
 * A **seed** is a signed-in walk: `start` is a "start as" scenario of the api
 * (`e2e/_shared/start-as.yaml`), `onboard` for a new account with nothing, or `fresh` for the
 * splash; its steps live in `e2e/sweep/subflows/seed-<name>.yaml` and `shots` lists what they take.
 */
import manifest from './sweep-manifest.json' with { type: 'json' };

export const SWEEP_DIR = 'e2e/sweep';
export const LANGUAGES = ['en', 'vi'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface Scene {
  /** The list row's id. */
  readonly item: string;
  readonly ready: string;
  /** The screenshot's name, without its language. */
  readonly shot: string;
}

export interface Lab {
  readonly name: string;
  readonly summary: string;
  /** The Developer tools row, or empty when the scenes are Developer tools rows themselves. */
  readonly nav: string;
  readonly list: string;
  readonly scenes: readonly Scene[];
}

export interface Seed {
  readonly name: string;
  readonly summary: string;
  readonly start: string;
  readonly shots: readonly string[];
}

interface RawLab {
  readonly name: string;
  readonly summary: string;
  readonly nav: string;
  readonly rows: string;
  readonly list?: string;
  readonly scenes: readonly string[];
}
const data: { readonly seeds: readonly Seed[]; readonly labs: readonly RawLab[] } = manifest;

function parseScene(line: string, rows: string, lab: string): Scene {
  const [row, ready, shot] = line.split('|').map((part) => part.trim());
  if (!row || !ready || !shot || line.split('|').length !== 3)
    throw new Error(`${lab}: a scene is "row | ready | shot", not "${line}"`);
  return { item: `${rows}${row}`, ready, shot };
}

export const LABS: readonly Lab[] = data.labs.map((lab) => ({
  name: lab.name,
  summary: lab.summary,
  nav: lab.nav,
  list: lab.list ?? `${lab.rows}.*`,
  scenes: lab.scenes.map((line) => parseScene(line, lab.rows, lab.name)),
}));

export const SEEDS: readonly Seed[] = data.seeds;

export interface SweepFlow {
  /** Repo-root-relative, without extension: `e2e/sweep/lab-guide-en`. */
  readonly flow: string;
  readonly kind: 'lab' | 'seed';
  readonly name: string;
  readonly lang: Language;
  /** The screenshots it takes, as their files are named: `en-3j-1-error`. */
  readonly shots: readonly string[];
}

/** Every generated flow with the screenshots it is to take. */
export function sweepFlows(): SweepFlow[] {
  const entries = [
    ...SEEDS.map((seed) => ({ kind: 'seed' as const, name: seed.name, shots: seed.shots })),
    ...LABS.map((lab) => ({
      kind: 'lab' as const,
      name: lab.name,
      shots: lab.scenes.map((scene) => scene.shot),
    })),
  ];
  return entries.flatMap(({ kind, name, shots }) =>
    LANGUAGES.map((lang) => ({
      flow: `${SWEEP_DIR}/${kind}-${name}-${lang}`,
      kind,
      name,
      lang,
      shots: shots.map((shot) => `${lang}-${shot}`),
    })),
  );
}

/** Screenshot names per language, without the language. */
export function manifestShots(): string[] {
  return [
    ...SEEDS.flatMap((seed) => seed.shots),
    ...LABS.flatMap((lab) => lab.scenes.map((scene) => scene.shot)),
  ];
}

/** What is wrong with the manifest itself: a name used twice, or one a file cannot carry. */
export function manifestProblems(): string[] {
  const problems: string[] = [];
  const names = [...SEEDS.map((seed) => `seed-${seed.name}`), ...LABS.map((l) => `lab-${l.name}`)];
  for (const [label, list] of [
    ['flow', names],
    ['screenshot', manifestShots()],
  ] as const) {
    const seen = new Set<string>();
    for (const name of list) {
      if (seen.has(name)) problems.push(`${label} ${name} is listed twice`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
        problems.push(`${label} ${name}: use a-z, 0-9, -`);
      seen.add(name);
    }
  }
  return problems;
}
