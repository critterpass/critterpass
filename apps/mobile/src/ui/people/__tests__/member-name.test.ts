/** A member whose account was erased is never a blank: one label, the same everywhere. */
import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { formerMemberLabel, isFormerMember, memberFirstName, memberName } from '../member-name';

describe('member names', () => {
  it('reads "Former member" for a name that is gone', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    for (const gone of [null, undefined, '', '   ']) {
      expect(memberName(gone)).toBe('Former member');
      expect(memberFirstName(gone)).toBe('Former member');
      expect(isFormerMember(gone)).toBe(true);
    }
    expect(isFormerMember(formerMemberLabel())).toBe(true);
  });

  it('keeps a real name, full or first', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    expect(memberName('  Maya Tan ')).toBe('Maya Tan');
    expect(memberFirstName('Maya Tan')).toBe('Maya');
    expect(isFormerMember('Maya')).toBe(false);
  });
});
