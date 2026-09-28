import { describe, expect, it } from 'vitest';

import { flowAppId, formatUiQa, scanUiQa } from './ui-qa-scan';

describe('scanUiQa', () => {
  it('keeps each distinct report once and ignores every other line', () => {
    const log = [
      'Running flow…',
      '[ui-qa] TEXT_TRUNCATED "onboarding-title" displayHero',
      '2026-09-29 12:00:01 app[42] [ui-qa] STICKER_NO_OUTLINE "gecko:Tokek"',
      '[ui-qa] TEXT_TRUNCATED "onboarding-title" displayHero',
      '',
    ].join('\n');
    expect(scanUiQa(log)).toEqual([
      {
        code: 'TEXT_TRUNCATED',
        subject: '"onboarding-title" displayHero',
        line: '[ui-qa] TEXT_TRUNCATED "onboarding-title" displayHero',
      },
      {
        code: 'STICKER_NO_OUTLINE',
        subject: '"gecko:Tokek"',
        line: '[ui-qa] STICKER_NO_OUTLINE "gecko:Tokek"',
      },
    ]);
    expect(scanUiQa('all good\n')).toEqual([]);
  });

  it('summarises by flow, leaving clean flows out', () => {
    const reports = scanUiQa('[ui-qa] TEXT_WORD_BROKEN "SGN" h3');
    const summary = formatUiQa(
      new Map([
        ['e2e/onboarding/screens-en.yaml', reports],
        ['e2e/screens/home.yaml', []],
      ]),
    );
    expect(summary).toBe('e2e/onboarding/screens-en.yaml:\n  [ui-qa] TEXT_WORD_BROKEN "SGN" h3');
    expect(formatUiQa(new Map([['a.yaml', []]]))).toBe('');
  });

  it('reads the app id from a flow header', () => {
    expect(flowAppId('appId: app.critterpass.dev\n---\n- launchApp')).toBe('app.critterpass.dev');
    expect(flowAppId("appId: 'app.critterpass'\n---")).toBe('app.critterpass');
    expect(flowAppId('- launchApp')).toBeUndefined();
  });
});
