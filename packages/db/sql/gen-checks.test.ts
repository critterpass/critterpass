import { describe, expect, it } from 'vitest';

import { genEnumCheck } from './gen-checks';

describe('genEnumCheck', () => {
  it('emits an ALTER TABLE ... CHECK statement listing every value', () => {
    expect(genEnumCheck({ table: 'crew_members', column: 'role', values: ['organiser', 'member'] }))
      .toBe(
        "ALTER TABLE crew_members ADD CONSTRAINT crew_members_role_check CHECK (role IN ('organiser', 'member'));",
      );
  });

  it('escapes single quotes in values', () => {
    expect(genEnumCheck({ table: 't', column: 'c', values: ["can't"] })).toBe(
      "ALTER TABLE t ADD CONSTRAINT t_c_check CHECK (c IN ('can''t'));",
    );
  });

  it('bases the constraint name on the table name without a schema prefix', () => {
    expect(genEnumCheck({ table: 'ops.ops_config', column: 'kind', values: ['a'] })).toBe(
      "ALTER TABLE ops.ops_config ADD CONSTRAINT ops_config_kind_check CHECK (kind IN ('a'));",
    );
  });

  it('throws for an empty value list', () => {
    expect(() => genEnumCheck({ table: 't', column: 'c', values: [] })).toThrow(/no values/);
  });
});
