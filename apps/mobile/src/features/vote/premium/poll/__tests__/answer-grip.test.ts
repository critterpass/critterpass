import { describe, expect, it } from '@jest/globals';

import { droppedIndex, moveItem } from '../answer-grip';

describe('reordering a new poll’s answers', () => {
  it('drops a dragged row one place per row height, inside the list', () => {
    expect(droppedIndex(0, 30, 52, 3)).toBe(1);
    expect(droppedIndex(0, 20, 52, 3)).toBe(0);
    expect(droppedIndex(2, -110, 52, 3)).toBe(0);
    expect(droppedIndex(1, 400, 52, 3)).toBe(2);
    expect(droppedIndex(1, -400, 52, 3)).toBe(0);
  });

  it('moves one answer and keeps the others in order', () => {
    expect(moveItem(['Yes', 'Maybe', 'No'], 0, 2)).toEqual(['Maybe', 'No', 'Yes']);
    expect(moveItem(['Yes', 'Maybe', 'No'], 2, 0)).toEqual(['No', 'Yes', 'Maybe']);
    expect(moveItem(['Yes', 'Maybe'], 5, 0)).toEqual(['Yes', 'Maybe']);
  });
});
