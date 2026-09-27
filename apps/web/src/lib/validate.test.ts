import { describe, expect, it } from 'vitest';

import { isBodyTooLarge, isHoneypotTripped, normalizeEmail } from './validate';

describe('normalizeEmail', () => {
  it('trims and lowercases a valid email', () => {
    expect(normalizeEmail('  Jane@Example.com  ')).toBe('jane@example.com');
  });

  it('rejects missing @ or domain dot', () => {
    expect(normalizeEmail('jane@example')).toBeNull();
    expect(normalizeEmail('janeexample.com')).toBeNull();
  });

  it('rejects whitespace inside the address', () => {
    expect(normalizeEmail('jane doe@example.com')).toBeNull();
  });

  it('rejects non-strings, empty strings and overlong input', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('isHoneypotTripped', () => {
  it('is false for empty or missing values', () => {
    expect(isHoneypotTripped('')).toBe(false);
    expect(isHoneypotTripped('   ')).toBe(false);
    expect(isHoneypotTripped(undefined)).toBe(false);
  });

  it('is true once a bot fills the hidden field', () => {
    expect(isHoneypotTripped('http://spam.example')).toBe(true);
  });
});

describe('isBodyTooLarge', () => {
  it('allows a missing content-length', () => {
    expect(isBodyTooLarge(null)).toBe(false);
  });

  it('allows small bodies and rejects oversized ones', () => {
    expect(isBodyTooLarge('200')).toBe(false);
    expect(isBodyTooLarge('999999')).toBe(true);
  });
});
