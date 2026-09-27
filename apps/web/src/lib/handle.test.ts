import { describe, expect, it } from 'vitest';

import { deriveHandleBase, resolveUniqueHandle } from './handle';

describe('deriveHandleBase', () => {
  it('lowercases and strips non-alphanumerics from the local part', () => {
    expect(deriveHandleBase('Jane.Doe+trip@example.com')).toBe('janedoetri');
  });

  it('truncates to 10 characters', () => {
    expect(deriveHandleBase('abcdefghijklmnop@example.com')).toBe('abcdefghij');
  });

  it('falls back to "friend" when nothing alphanumeric remains', () => {
    expect(deriveHandleBase('...@example.com')).toBe('friend');
  });
});

describe('resolveUniqueHandle', () => {
  it('returns the base when free', () => {
    expect(resolveUniqueHandle('jane', () => false)).toBe('jane');
  });

  it('appends the first free numeric suffix', () => {
    const taken = new Set(['jane', 'jane2', 'jane3']);
    expect(resolveUniqueHandle('jane', (candidate) => taken.has(candidate))).toBe('jane4');
  });

  it('throws once every attempt is exhausted', () => {
    expect(() => resolveUniqueHandle('jane', () => true)).toThrow();
  });
});
