import { describe, expect, it } from '@jest/globals';

import { editorialFor, editorialTextFor } from '../editorial-note';

const note = JSON.stringify({
  why_go: 'Hike or ride to the top for the plateau view.',
  must_see: true,
  i18n: { vi: { why_go: 'Leo bộ hoặc đi xe lên đỉnh để ngắm toàn cảnh cao nguyên.' } },
});

describe('a place’s note as the reader sees it', () => {
  it('reads the line in the app’s language where the note has it', () => {
    expect(editorialFor(note, 'vi')).toMatchObject({
      why_go: 'Leo bộ hoặc đi xe lên đỉnh để ngắm toàn cảnh cao nguyên.',
      must_see: true,
    });
  });

  it('reads English where it has no line in that language', () => {
    expect(editorialFor(note, 'de')?.['why_go']).toBe(
      'Hike or ride to the top for the plateau view.',
    );
  });

  it('leaves no note, or one that is not JSON, as it is', () => {
    expect(editorialFor(null, 'vi')).toBeNull();
    expect(editorialFor('not json', 'vi')).toBeNull();
    expect(editorialTextFor('not json', 'vi')).toBe('not json');
  });
});
