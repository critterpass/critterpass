/** Chat cuts names to the first word; "Former member" is one name and stays whole. */
import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { memberName } from '@/ui/people/member-name';

import { firstName } from '../use-typing';

describe('chat names', () => {
  it('keeps "Former member" whole and still cuts a real name to its first word', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    expect(firstName(memberName(null))).toBe('Former member');
    expect(firstName('Maya Tan')).toBe('Maya');
    expect(firstName(null)).toBeNull();
  });
});
