/**
 * Rewrites the README's progress section (between `<!-- progress:start -->` and
 * `<!-- progress:end -->`) and `docs/assets/readme/progress.svg` from the build plan's phase files.
 *
 *   pnpm readme:progress
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readPlan } from './parse';
import { progressSection, progressSvg, replaceSection, totals } from './render';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const PLAN_DIR = 'plans/260926-1718-critterpass-full-build';
const SVG_PATH = 'docs/assets/readme/progress.svg';
const README = path.join(REPO_ROOT, 'README.md');

function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Saigon' }).format(new Date());
}

const phases = readPlan(path.join(REPO_ROOT, PLAN_DIR));
const sum = totals(phases);
writeFileSync(path.join(REPO_ROOT, SVG_PATH), progressSvg(sum));
const section = progressSection(phases, { planPath: PLAN_DIR, svgPath: SVG_PATH, date: today() });
writeFileSync(README, replaceSection(readFileSync(README, 'utf8'), section));
console.log(
  `README progress: ${sum.tasksDone}/${sum.tasks} tasks, ${sum.phasesDone}/${sum.phases} phases done`,
);
