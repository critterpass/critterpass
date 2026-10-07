import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { collect, parseLaunches, summarise } from './device-timings';

// Recorded by Maestro on a simulator run of a gallery flow; written in no particular order.
const FIXTURE = fileURLToPath(new URL('./__fixtures__/maestro-commands.json', import.meta.url));
const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Parameters<typeof parseLaunches>[0];

const command = (
  name: string,
  body: object,
  timestamp: number,
  duration: number,
  status = 'COMPLETED',
) => ({
  command: { [name]: body },
  metadata: { status, timestamp, duration },
});
const waitFor = (id: string, timestamp: number, duration: number, status?: string) =>
  command(
    'assertConditionCommand',
    { condition: { visible: { idRegex: id } } },
    timestamp,
    duration,
    status,
  );

describe('launch timings from Maestro commands', () => {
  it('times a recorded launch to the end of the wait that follows it', () => {
    expect(parseLaunches(recorded)).toEqual([
      {
        appId: 'app.critterpass.dev',
        clearState: true,
        launchMs: 5230,
        // launch at …037582; the wait for the first screen ends at …042814 + 12035
        readyMs: 17267,
        readyOn: 'dev-tools-entry',
      },
    ]);
  });

  it('leaves out resumes and failed launches', () => {
    const launches = parseLaunches([
      command('launchAppCommand', { appId: 'a', stopApp: false }, 1000, 300),
      waitFor('home', 1300, 200),
      command('launchAppCommand', { appId: 'a' }, 5000, 900, 'FAILED'),
    ]);
    expect(launches).toEqual([]);
  });

  it('reports no first-screen time when the flow acts before it waits, or the wait fails', () => {
    const acted = parseLaunches([
      command('launchAppCommand', { appId: 'a' }, 1000, 400),
      command('tapOnElement', { selector: { idRegex: 'x' } }, 1400, 100),
      waitFor('home', 1500, 200),
    ]);
    expect(acted).toMatchObject([{ launchMs: 400, readyMs: undefined, clearState: false }]);
    const failed = parseLaunches([
      command('launchAppCommand', { appId: 'a' }, 1000, 400),
      waitFor('home', 1400, 60_000, 'FAILED'),
    ]);
    expect(failed[0]?.readyMs).toBeUndefined();
  });

  it('gathers every flow folder of a shard and separates fresh installs in the summary', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'device-timings-'));
    mkdirSync(path.join(out, 'gallery-tabs'), { recursive: true });
    cpSync(FIXTURE, path.join(out, 'gallery-tabs', 'commands-(gallery-tabs.yaml).json'));
    const flows = collect(out);
    expect(flows.map((f) => f.flow)).toEqual(['gallery-tabs']);

    const summary = summarise([
      ...flows,
      {
        flow: 'relaunch',
        launches: [
          { appId: 'a', clearState: false, launchMs: 1000, readyMs: 3000, readyOn: 'tab-trips' },
          { appId: 'a', clearState: false, launchMs: 1200, readyMs: undefined, readyOn: undefined },
        ],
      },
    ]);
    expect(summary).toEqual({
      launches: 3,
      launchMsMedian: 1200,
      readyMsMedian: 10133.5,
      readyMsMedianKeptData: 3000,
    });
  });
});
