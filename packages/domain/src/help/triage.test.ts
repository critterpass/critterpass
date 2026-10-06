import { describe, expect, it } from 'vitest';

import {
  buildTrackerIssue,
  compareAppVersions,
  readTrackerLabels,
  scrubFeedbackText,
} from './triage';

describe('scrubFeedbackText', () => {
  it("masks contact details, links, ids, handles and the reporter's known names", () => {
    const scrubbed = scrubFeedbackText(
      'Maya Tran here (maya@example.com, 0905 123 456, +84 905 123 456). Our trip "Đà Nẵng Crew" ' +
        'at https://critterpass.app/t/abc?token=1 broke for @maya.t, user ' +
        '0199a1b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b. MAYA says the split is wrong by 20000.',
      ['Maya Tran', 'Maya', 'maya.t', 'Đà Nẵng Crew'],
    );
    for (const leak of [
      'Maya',
      'MAYA',
      'example.com',
      '0905',
      '905 123',
      'Đà Nẵng',
      'critterpass.app/t',
      'maya.t',
      '0199a1b2',
    ]) {
      expect(scrubbed, leak).not.toContain(leak);
    }
    expect(scrubbed).toContain('the split is wrong by 20000');
  });

  it('leaves a word alone when a known name is only part of it', () => {
    expect(scrubFeedbackText('The Annex map is annoying', ['Ann'])).toBe(
      'The Annex map is annoying',
    );
  });
});

describe('buildTrackerIssue', () => {
  it('carries the ticket number, the labels, the version and the words only', () => {
    const issue = buildTrackerIssue({
      ticketNo: 10042,
      text: 'The split is off\n# not a heading',
      summary: 'Split amounts are wrong',
      kind: 'bug',
      area: 'money',
      severity: 'high',
      appVersion: '1.0.3',
      platform: 'ios',
    });
    expect(issue.title).toBe('[CP-10042] Split amounts are wrong');
    expect(issue.labels).toEqual(['feedback', 'kind:bug', 'area:money', 'severity:high']);
    expect(issue.body).toContain('- App version: 1.0.3');
    expect(issue.body).toContain('- Platform: ios');
    expect(issue.body).toContain('> # not a heading');
  });
});

describe('readTrackerLabels', () => {
  it('reads the triage labels and the fixed version, and ignores the rest', () => {
    expect(
      readTrackerLabels(['feedback', 'severity:critical', 'area:nowhere', 'fixed-in:1.2.0']),
    ).toEqual({ severity: 'critical', fixedInVersion: '1.2.0' });
  });
});

describe('compareAppVersions', () => {
  it('orders versions by number, not by text', () => {
    expect(compareAppVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareAppVersions('1.2', '1.2.0')).toBe(0);
    expect(compareAppVersions('1.1.9', '1.2.0')).toBeLessThan(0);
  });
});
