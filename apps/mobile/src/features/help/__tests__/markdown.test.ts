import { describe, expect, it } from '@jest/globals';

import { helpLinkSlug, parseMarkdown } from '../data/markdown';

describe('help article markdown', () => {
  it('reads headings, paragraphs joined across lines, and both kinds of list', () => {
    const blocks = parseMarkdown(
      [
        '## Before you fly',
        'Open the trip',
        'and save the pack.',
        '',
        '- Maps',
        '- **Phrase cards**',
        '1. Open Settings',
        '2. Tap Restore',
        'See [Refunds](/help/refunds) for more.',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'heading', text: 'Before you fly' },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'Open the trip and save the pack.' }] },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'Maps' }], [{ kind: 'bold', text: 'Phrase cards' }]],
      },
      {
        kind: 'list',
        ordered: true,
        items: [[{ kind: 'text', text: 'Open Settings' }], [{ kind: 'text', text: 'Tap Restore' }]],
      },
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'See ' },
          { kind: 'link', text: 'Refunds', href: '/help/refunds' },
          { kind: 'text', text: ' for more.' },
        ],
      },
    ]);
  });

  it('opens only help links inside the app', () => {
    expect(helpLinkSlug('/help/offline-maps')).toBe('offline-maps');
    expect(helpLinkSlug('https://critterpass.app/help/offline-maps')).toBeNull();
    expect(helpLinkSlug('/help/../settings')).toBeNull();
  });
});
