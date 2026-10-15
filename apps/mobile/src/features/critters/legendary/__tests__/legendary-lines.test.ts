import { describe, expect, it } from '@jest/globals';

import { legendaryLines } from '../legendary-model';

describe('legendary row lines', () => {
  it('titles a found legendary by its name over where and when', () => {
    expect(
      legendaryLines({ name: 'Marigold Ajo', placeLine: 'Mexico City · Día de Muertos' }),
    ).toEqual({ title: 'Marigold Ajo', line: 'Mexico City · Día de Muertos' });
  });

  it('splits the place line for one not found yet, so no line repeats the title', () => {
    expect(legendaryLines({ name: null, placeLine: 'Guadalajara · Fiestas de Octubre' })).toEqual({
      title: 'Fiestas de Octubre',
      line: 'Guadalajara',
    });
  });

  it('keeps a place line with no occasion as the title alone', () => {
    expect(legendaryLines({ name: null, placeLine: 'Bali' })).toEqual({ title: 'Bali', line: '' });
  });
});
