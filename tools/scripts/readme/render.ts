import type { PlanPhase } from './parse';

// Night palette from `@cp/design-tokens` (color.ink.850/800/300, paper.base, yellow, orange, green).
const NIGHT = '#17142a';
const SURFACE = '#1f1b38';
const MUTED = '#8d87a8';
const PAPER = '#f4efe4';
const YELLOW = '#ffd84a';
const ORANGE = '#ff9a4d';
const GREEN = '#54d6a4';
const FONT = "Archivo, 'Helvetica Neue', 'Segoe UI', Arial, sans-serif";

export interface PlanTotals {
  readonly tasksDone: number;
  readonly tasks: number;
  readonly phasesDone: number;
  readonly phasesInProgress: number;
  readonly phases: number;
}

export function totals(phases: readonly PlanPhase[]): PlanTotals {
  const tasks = phases.flatMap((phase) => phase.tasks);
  return {
    tasksDone: tasks.filter((task) => task.state === 'done').length,
    tasks: tasks.length,
    phasesDone: phases.filter((phase) => phase.state === 'done').length,
    phasesInProgress: phases.filter((phase) => phase.state === 'in_progress').length,
    phases: phases.length,
  };
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function svgBar(y: number, label: string, done: number, total: number, fill: string): string {
  const x = 32;
  const width = 696;
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return [
    `<text x="${x}" y="${y - 14}" fill="${PAPER}" font-size="17" font-weight="700">${label}</text>`,
    `<text x="${x + width}" y="${y - 14}" fill="${MUTED}" font-size="15" text-anchor="end">${done} / ${total} · ${percent(done, total)}%</text>`,
    `<rect x="${x}" y="${y}" width="${width}" height="16" rx="8" fill="${SURFACE}"/>`,
    `<rect x="${x}" y="${y}" width="${filled}" height="16" rx="8" fill="${fill}"/>`,
  ].join('\n  ');
}

/** The overall bar: tasks and phases done, drawn without any external image service. */
export function progressSvg(sum: PlanTotals): string {
  const alt = `${sum.tasksDone} of ${sum.tasks} tasks and ${sum.phasesDone} of ${sum.phases} phases done`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180" viewBox="0 0 760 180" role="img" aria-label="${alt}">
  <title>${alt}</title>
  <rect width="760" height="180" rx="20" fill="${NIGHT}"/>
  <g font-family="${FONT}">
  ${svgBar(58, 'Tasks', sum.tasksDone, sum.tasks, YELLOW)}
  ${svgBar(126, 'Phases', sum.phasesDone, sum.phases, ORANGE)}
  <circle cx="${32 + 6}" cy="${158}" r="5" fill="${GREEN}"/>
  <text x="${32 + 18}" y="${163}" fill="${MUTED}" font-size="13">${sum.phasesInProgress} phases in progress</text>
  </g>
</svg>
`;
}

const MARKER = { done: '● done', in_progress: '◐ in progress', pending: '○ pending' } as const;

/** A ten-cell text bar, so the table needs no images. */
export function miniBar(done: number, total: number): string {
  const cells = total === 0 ? 0 : Math.round((done / total) * 10);
  return '▰'.repeat(cells) + '▱'.repeat(10 - cells);
}

export interface SectionOptions {
  readonly planPath: string;
  readonly svgPath: string;
  readonly date: string;
}

/** The README block between the progress markers: overall bar, then one table grouped by wave. */
export function progressSection(phases: readonly PlanPhase[], options: SectionOptions): string {
  const sum = totals(phases);
  const rows: string[] = [];
  let lastWave = -1;
  const byWave = [...phases].sort((a, b) => a.wave - b.wave || a.number - b.number);
  for (const phase of byWave) {
    const done = phase.tasks.filter((task) => task.state === 'done').length;
    const total = phase.tasks.length;
    const wave = phase.wave === lastWave ? '' : `**${phase.wave}**`;
    lastWave = phase.wave;
    const link = `[${phase.number} · ${phase.title}](${options.planPath}/${phase.file})`;
    rows.push(
      `| ${wave} | ${link} | ${MARKER[phase.state]} | ${miniBar(done, total)} | ${done}/${total} |`,
    );
  }
  return [
    `<p align="center"><img src="${options.svgPath}" width="760" alt="${sum.tasksDone} of ${sum.tasks} tasks and ${sum.phasesDone} of ${sum.phases} phases done"></p>`,
    '',
    `**${sum.tasksDone} of ${sum.tasks} tasks** (${percent(sum.tasksDone, sum.tasks)}%) and **${sum.phasesDone} of ${sum.phases} phases** done, ${sum.phasesInProgress} in progress. Last updated ${options.date}; regenerate with \`pnpm readme:progress\`. Narrative and next steps: [plan.md](${options.planPath}/plan.md).`,
    '',
    '<details open>',
    '<summary>Phases by wave</summary>',
    '',
    '| Wave | Phase | Status | Progress | Tasks |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '</details>',
  ].join('\n');
}

export const START_MARKER = '<!-- progress:start -->';
export const END_MARKER = '<!-- progress:end -->';

/** Replaces what sits between two markers (the progress ones by default); both must already be in the README. */
export function replaceSection(
  readme: string,
  section: string,
  startMarker = START_MARKER,
  endMarker = END_MARKER,
): string {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README needs ${startMarker} followed by ${endMarker}`);
  }
  return `${readme.slice(0, start + startMarker.length)}\n\n${section}\n\n${readme.slice(end)}`;
}
