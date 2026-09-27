import { describe, expect, it } from 'vitest';

import { readPoEntries } from './po-catalog.js';

describe('readPoEntries', () => {
  it('skips the header entry (empty msgid) and reads simple pairs', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '"Language: en\\n"',
      '',
      'msgid "common.retry.label"',
      'msgstr "Try again"',
      '',
    ].join('\n');

    expect(readPoEntries(po)).toEqual([
      { id: 'common.retry.label', translation: 'Try again', comment: undefined, references: [] },
    ]);
  });

  it('returns an empty translation for an untranslated entry', () => {
    const po = ['msgid ""', 'msgstr ""', '', 'msgid "common.cancel.label"', 'msgstr ""', ''].join(
      '\n',
    );

    expect(readPoEntries(po)[0]?.translation).toBe('');
  });

  it('joins gettext line-continuations for both msgid and msgstr', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '',
      'msgid ""',
      '"onboarding.welcome.body"',
      'msgstr ""',
      '"Line one "',
      '"line two"',
      '',
    ].join('\n');

    expect(readPoEntries(po)[0]).toMatchObject({
      id: 'onboarding.welcome.body',
      translation: 'Line one line two',
    });
  });

  it('captures the extracted comment and source references for an entry', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '',
      '#. shown on the crew invite screen, above the accept button',
      '#: apps/mobile/src/app/crew/invite.tsx',
      'msgid "crew.invite.accept"',
      'msgstr "Accept"',
      '',
    ].join('\n');

    expect(readPoEntries(po)).toEqual([
      {
        id: 'crew.invite.accept',
        translation: 'Accept',
        comment: 'shown on the crew invite screen, above the accept button',
        references: ['apps/mobile/src/app/crew/invite.tsx'],
      },
    ]);
  });

  it('does not leak one entry’s comment onto the next entry', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '',
      '#. only for the first key',
      'msgid "a.b.c"',
      'msgstr "First"',
      '',
      'msgid "d.e.f"',
      'msgstr "Second"',
      '',
    ].join('\n');

    const entries = readPoEntries(po);
    expect(entries[0]?.comment).toBe('only for the first key');
    expect(entries[1]?.comment).toBeUndefined();
  });

  it('ignores comment lines when there is nothing more specific to capture', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '',
      '#. js-lingui-explicit-id',
      '#: apps/mobile/src/app/index.tsx',
      'msgid "common.devHome.buildVariantLabel"',
      'msgstr "Build variant: {variant}"',
      '',
    ].join('\n');

    expect(readPoEntries(po)[0]).toMatchObject({
      id: 'common.devHome.buildVariantLabel',
      translation: 'Build variant: {variant}',
    });
  });

  it('unescapes quotes and backslashes', () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '',
      'msgid "a.b.c"',
      'msgstr "Say \\"hi\\" \\\\ ok"',
      '',
    ].join('\n');

    expect(readPoEntries(po)[0]?.translation).toBe('Say "hi" \\ ok');
  });
});
