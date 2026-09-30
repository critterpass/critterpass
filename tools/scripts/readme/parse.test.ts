import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readPlan, taskState } from './parse';
import { progressSection, replaceSection, totals } from './render';

const fixture = path.join(import.meta.dirname, 'fixtures/plan');

describe('plan progress parser', () => {
  it('reads phases, short titles, waves and the last status line of each task block', () => {
    const phases = readPlan(fixture);
    expect(phases.map((phase) => [phase.number, phase.title, phase.wave, phase.state])).toEqual([
      [1, 'Bootstrap', 1, 'done'],
      [2, 'Money', 2, 'in_progress'],
    ]);
    expect(phases[0]?.tasks.map((task) => task.state)).toEqual(['done', 'done']);
    expect(phases[1]?.tasks.map((task) => task.state)).toEqual([
      'done',
      'in_progress',
      'blocked',
      'pending',
    ]);
    expect(totals(phases)).toEqual({
      tasksDone: 3,
      tasks: 6,
      phasesDone: 1,
      phasesInProgress: 1,
      phases: 2,
    });
  });

  it('counts only a leading "done" as finished', () => {
    expect(taskState('done — abc')).toBe('done');
    expect(taskState('server part done — abc')).toBe('in_progress');
    expect(taskState(undefined)).toBe('pending');
  });

  it('rewrites only the text between the progress markers', () => {
    const section = progressSection(readPlan(fixture), {
      planPath: 'plans/x',
      svgPath: 'p.svg',
      date: '2026-01-02',
    });
    const readme = replaceSection(
      '# A\n<!-- progress:start -->\nold\n<!-- progress:end -->\n## B\n',
      section,
    );
    expect(readme).toContain(
      '| **2** | [2 · Money](plans/x/phase-money.md) | ◐ in progress | ▰▰▰▱▱▱▱▱▱▱ | 1/4 |',
    );
    expect(readme).not.toContain('old');
    expect(readme.endsWith('<!-- progress:end -->\n## B\n')).toBe(true);
  });
});
