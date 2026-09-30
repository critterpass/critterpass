import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildMedia,
  formatGateReport,
  parseJunit,
  previewSpeed,
  readGateFlows,
} from './release-gate';

const pass = (name: string, time: number) =>
  `<testsuites><testsuite tests="1" failures="0" time="${String(time)}"><testcase id="${name}" name="${name}" time="${String(time)}" status="SUCCESS"/></testsuite></testsuites>`;
const fail = (name: string, time: number, message: string) =>
  `<testsuites><testsuite tests="1" failures="1" time="${String(time)}"><testcase id="${name}" name="${name}" time="${String(time)}" status="ERROR">\n<failure>${message}</failure>\n</testcase></testsuite></testsuites>`;

function write(root: string, file: string, text: string | Buffer): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe('release gate report', { timeout: 60_000 }, () => {
  it('reads pass, duration and the failing step from a Maestro JUnit report', () => {
    expect(parseJunit(pass('money', 147.0))).toEqual({ passed: true, seconds: 147 });
    expect(
      parseJunit(
        fail('money', 79, 'Assertion is false: id: &quot;money-latest-row&quot; is visible'),
      ),
    ).toEqual({
      passed: false,
      seconds: 79,
      failure: 'Assertion is false: id: "money-latest-row" is visible',
    });
  });

  it('lists every flow per platform and hides a passing JS commit check', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'release-gate-'));
    write(
      root,
      'device-android-shard-1/junit/tools__scripts__ci-device__js-commit.xml',
      pass('js-commit', 30),
    );
    write(root, 'device-android-shard-1/junit/e2e__happy__onboarding.xml', pass('onboarding', 200));
    write(
      root,
      'device-android-shard-2/junit/e2e__happy__money.xml',
      fail('money', 90, 'Element not found: Id matching regex: settle-confirm'),
    );
    write(root, 'device-ios-shard-1/junit/e2e__happy__onboarding.xml', pass('onboarding', 150));
    write(root, 'unrelated/junit/x.xml', pass('x', 1));
    const flows = readGateFlows(root);
    expect(flows.map((flow) => `${flow.name} ${flow.platform} ${String(flow.passed)}`)).toEqual([
      'money android false',
      'onboarding android true',
      'onboarding ios true',
    ]);
  });

  it('writes a table with previews, video links and the failing step with its screen', () => {
    const flow = {
      platform: 'android',
      slug: 'e2e__happy__money',
      name: 'money',
      passed: false,
      seconds: 125,
      failure: 'Element not found: Id matching regex: settle | confirm',
      shardDir: '/x',
    };
    const text = formatGateReport(
      [
        {
          flow,
          media: {
            mp4: 'android/money.mp4',
            gif: 'android/money.gif',
            failureShot: 'android/money-failure.png',
          },
        },
      ],
      { rawUrl: 'https://raw/run', blobUrl: 'https://blob/run', commit: 'abc123' },
    );
    expect(text).toContain('**Fail**: 1 of 1 flow runs failed. From commit `abc123`.');
    expect(text).toContain(
      '| `money` | android | **FAIL** | 2m 5s | <img src="https://raw/run/android/money.gif" width="120"> | [MP4](https://blob/run/android/money.mp4) | `Element not found: Id matching regex: settle \\| confirm`<br><img src="https://raw/run/android/money-failure.png" width="120"> |',
    );
  });

  it('speeds long previews up so they stay near a minute', () => {
    expect(previewSpeed(30)).toBe(4);
    expect(previewSpeed(600)).toBe(10);
  });

  it.skipIf(!hasFfmpeg)('joins recorded segments into an MP4 and a GIF preview', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'release-gate-media-'));
    const videos = path.join(root, 'shard/videos/e2e__happy__chat');
    mkdirSync(videos, { recursive: true });
    for (const name of ['seg-100.mp4', 'seg-101.mp4']) {
      const made = spawnSync('ffmpeg', [
        ...['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=540x1200:rate=10'],
        ...['-t', '2', '-pix_fmt', 'yuv420p', path.join(videos, name)],
      ]);
      expect(made.status).toBe(0);
    }
    write(root, 'shard/failures/e2e__happy__chat.png', Buffer.from('png'));
    const media = buildMedia(
      {
        platform: 'android',
        slug: 'e2e__happy__chat',
        name: 'chat',
        passed: false,
        seconds: 4,
        failure: 'x',
        shardDir: path.join(root, 'shard'),
      },
      path.join(root, 'media'),
    );
    expect(media).toEqual({
      mp4: 'android/chat.mp4',
      gif: 'android/chat.gif',
      failureShot: 'android/chat-failure.png',
    });
    for (const file of [media.mp4, media.gif, media.failureShot])
      expect(existsSync(path.join(root, 'media', file ?? 'missing'))).toBe(true);
    expect(statSync(path.join(root, 'media/android/chat.gif')).size).toBeGreaterThan(0);
  });
});
