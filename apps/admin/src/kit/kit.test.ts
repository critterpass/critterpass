import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { diffValues, formatValue } from './diff';
import { defineAdminModule, defineCatalogue, defineQueue, visibleModules } from './registry';
import { fieldsFromSchema, parseFormState, toFormState } from './zod-fields';

const Page = () => null;

describe('fieldsFromSchema', () => {
  const schema = z.object({
    name: z.string().min(1).max(80),
    bio: z.string().max(2000).nullable(),
    colour: z.enum(['yellow', 'blue']),
    limit: z.number().int(),
    live: z.boolean(),
    words: z.record(z.string(), z.string()).describe('Local words'),
    destination_id: z.uuid(),
  });

  it('maps each zod type to an input kind and keeps labels and flags', () => {
    const fields = fieldsFromSchema(schema, ['colour']);
    expect(fields.map((field) => [field.name, field.kind])).toEqual([
      ['name', 'text'],
      ['bio', 'longtext'],
      ['colour', 'select'],
      ['limit', 'number'],
      ['live', 'boolean'],
      ['words', 'json'],
      ['destination_id', 'text'],
    ]);
    expect(fields.find((field) => field.name === 'colour')).toMatchObject({
      readOnly: true,
      options: ['yellow', 'blue'],
    });
    expect(fields.find((field) => field.name === 'words')?.label).toBe('Local words');
    expect(fields.find((field) => field.name === 'bio')).toMatchObject({ nullable: true });
  });

  it('round-trips values through form state and validates on the way back', () => {
    const fields = fieldsFromSchema(schema, ['colour']);
    const state = toFormState(fields, {
      name: 'Pon',
      bio: null,
      colour: 'yellow',
      limit: 30,
      live: true,
      words: { hello: 'sawasdee' },
      destination_id: '01920000-0000-7000-8000-000000000001',
    });
    expect(state['bio']).toBe('');
    expect(state['destination_id']).toBe('01920000-0000-7000-8000-000000000001');
    expect(parseFormState(schema, fields, state)).toEqual({
      ok: true,
      values: {
        name: 'Pon',
        bio: null,
        limit: 30,
        live: true,
        words: { hello: 'sawasdee' },
        destination_id: '01920000-0000-7000-8000-000000000001',
      },
    });
    const broken = parseFormState(schema, fields, { ...state, name: '', words: '{nope' });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(Object.keys(broken.errors).sort()).toEqual(['name', 'words']);
  });
});

describe('diffValues', () => {
  it('lists only changed fields and treats key order as irrelevant', () => {
    expect(
      diffValues(
        { name: 'Pon', words: { a: 1, b: 2 }, limit: 30 },
        { name: 'Pon', words: { b: 2, a: 1 }, limit: 40 },
      ),
    ).toEqual([{ field: 'limit', before: 30, after: 40 }]);
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('registry', () => {
  const flags = defineAdminModule({
    id: 'flags',
    area: 'flags',
    label: 'Flags',
    order: 30,
    routes: [{ path: 'flags', component: Page }],
  });
  const catalogue = defineAdminModule({
    id: 'catalogue',
    area: 'catalogue',
    label: 'Catalogue',
    order: 10,
    routes: [{ path: 'catalogue', component: Page }],
  });

  it('shows each role only the modules its areas allow, in order', () => {
    expect(visibleModules([flags, catalogue], ['support']).map((m) => m.id)).toEqual([]);
    expect(visibleModules([flags, catalogue], ['ops']).map((m) => m.id)).toEqual(['flags']);
    expect(visibleModules([flags, catalogue], ['owner']).map((m) => m.id)).toEqual([
      'catalogue',
      'flags',
    ]);
  });

  it('rejects queues with clashing shortcuts and catalogues with unknown read-only fields', () => {
    const base = {
      kind: 'report',
      statuses: ['open'],
      itemId: () => 'x',
      title: () => 'x',
      load: () => Promise.resolve({ items: [], next_cursor: null }),
      preview: () => null,
    };
    const run = () => Promise.resolve();
    expect(() =>
      defineQueue({
        ...base,
        actions: [
          { id: 'hide', label: 'Hide', shortcut: 'h', run },
          { id: 'approve', label: 'Approve', shortcut: 'h', run },
        ],
      }),
    ).toThrow(/shortcut/);
    expect(() =>
      defineCatalogue({
        kind: 'guides',
        label: 'Guides',
        schema: z.object({ name: z.string() }),
        readOnly: ['colour'],
        columns: [],
        itemId: () => 'x',
        title: () => 'x',
        values: () => ({}),
        creatable: false,
      }),
    ).toThrow(/colour/);
  });
});
