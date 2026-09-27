import { afterEach, describe, expect, it } from 'vitest';

import {
  getTablePrivacy,
  isPublishableClass,
  isRegisteredTable,
  listRegisteredTables,
  registerTablePrivacy,
  resetPrivacyRegistryForTests,
} from '../src/privacy';

afterEach(() => {
  resetPrivacyRegistryForTests();
});

describe('registerTablePrivacy / getTablePrivacy', () => {
  it('registers and retrieves a table class', () => {
    registerTablePrivacy('crews', { class: 'C1' });
    expect(getTablePrivacy('crews')).toEqual({ class: 'C1' });
    expect(isRegisteredTable('crews')).toBe(true);
  });

  it('returns undefined for an unregistered table', () => {
    expect(getTablePrivacy('nonexistent')).toBeUndefined();
    expect(isRegisteredTable('nonexistent')).toBe(false);
  });

  it('keeps column-level overrides for mixed-class tables', () => {
    registerTablePrivacy('users', { class: 'C1', columns: { home_currency: 'C2' } });
    expect(getTablePrivacy('users')).toEqual({ class: 'C1', columns: { home_currency: 'C2' } });
  });

  it('throws when a table is registered twice', () => {
    registerTablePrivacy('crews', { class: 'C1' });
    expect(() => registerTablePrivacy('crews', { class: 'C1' })).toThrow(/already registered/);
  });

  it('lists every registered table sorted', () => {
    registerTablePrivacy('crews', { class: 'C1' });
    registerTablePrivacy('users', { class: 'C1' });
    expect(listRegisteredTables()).toEqual(['crews', 'users']);
  });
});

describe('isPublishableClass', () => {
  it('allows C0 through C2', () => {
    expect(isPublishableClass('C0')).toBe(true);
    expect(isPublishableClass('C1')).toBe(true);
    expect(isPublishableClass('C2')).toBe(true);
  });

  it('excludes C3 through C5', () => {
    expect(isPublishableClass('C3')).toBe(false);
    expect(isPublishableClass('C4')).toBe(false);
    expect(isPublishableClass('C5')).toBe(false);
  });
});
