import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type TaskState = 'done' | 'in_progress' | 'blocked' | 'pending';
export type PhaseState = 'done' | 'in_progress' | 'pending';

export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly state: TaskState;
}

export interface PlanPhase {
  readonly number: number;
  readonly title: string;
  readonly file: string;
  readonly wave: number;
  readonly state: PhaseState;
  readonly tasks: readonly PlanTask[];
}

const TASK_HEADING = /^### (T\d+)\s*[—-]?\s*(.*)$/;
const STATUS_LINE = /^- Status:\s*(.*)$/;

/** Reads a task's last `- Status:` line: only a leading `done` counts as finished. */
export function taskState(status: string | undefined): TaskState {
  if (status === undefined) return 'pending';
  const value = status.trim().toLowerCase();
  if (value.startsWith('done')) return 'done';
  if (value.startsWith('blocked')) return 'blocked';
  if (value.startsWith('pending')) return 'pending';
  return 'in_progress';
}

function frontmatter(markdown: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown);
  const fields: Record<string, string> = {};
  for (const line of match?.[1]?.split('\n') ?? []) {
    const field = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (field?.[1] !== undefined && field[2] !== undefined) fields[field[1]] = field[2].trim();
  }
  return fields;
}

function phaseState(value: string | undefined): PhaseState {
  if (value === 'done') return 'done';
  if (value === 'in_progress') return 'in_progress';
  return 'pending';
}

/** Tasks are `### T<n>` blocks; a block ends at the next heading of level 2 or 3. */
export function parseTasks(markdown: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  let current: { id: string; title: string; status?: string } | undefined;
  const flush = () => {
    if (current)
      tasks.push({ id: current.id, title: current.title, state: taskState(current.status) });
    current = undefined;
  };
  for (const line of markdown.split('\n')) {
    const heading = TASK_HEADING.exec(line);
    if (heading?.[1] !== undefined) {
      flush();
      current = { id: heading[1], title: (heading[2] ?? '').trim() };
      continue;
    }
    if (/^#{2,3} /.test(line)) {
      flush();
      continue;
    }
    const status = STATUS_LINE.exec(line);
    if (current && status?.[1] !== undefined) current.status = status[1];
  }
  flush();
  return tasks;
}

/** Short phase names and order come from the plan's phase table (`| n | [Title](./file.md) | …`). */
export function parsePlanTable(markdown: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const row = /^\|\s*\d+\s*\|\s*\[([^\]]+)\]\(\.\/([^)]+\.md)\)/.exec(line);
    if (row?.[1] !== undefined && row[2] !== undefined) titles.set(row[2], row[1]);
  }
  return titles;
}

export function parsePhase(markdown: string, file: string, shortTitle?: string): PlanPhase {
  const fields = frontmatter(markdown);
  const number = Number(fields['phase']);
  const wave = Number(fields['wave']);
  if (!Number.isInteger(number) || !Number.isInteger(wave)) {
    throw new Error(`${file}: frontmatter needs integer "phase" and "wave"`);
  }
  return {
    number,
    title: shortTitle ?? fields['title'] ?? file,
    file,
    wave,
    state: phaseState(fields['status']),
    tasks: parseTasks(markdown),
  };
}

/** Reads `plan.md` and every `phase-*.md` beside it, ordered by phase number. */
export function readPlan(planDir: string): PlanPhase[] {
  const titles = parsePlanTable(readFileSync(path.join(planDir, 'plan.md'), 'utf8'));
  return readdirSync(planDir)
    .filter((file) => /^phase-.*\.md$/.test(file))
    .map((file) =>
      parsePhase(readFileSync(path.join(planDir, file), 'utf8'), file, titles.get(file)),
    )
    .sort((a, b) => a.number - b.number);
}
