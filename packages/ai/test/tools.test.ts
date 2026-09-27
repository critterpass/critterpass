import { AI_CALLERS } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  allowedTools,
  createToolRegistry,
  routeTools,
  resolveRoute,
  TOOL_ALLOW_LISTS,
  TOOL_NAMES,
  TOOL_SPECS,
  toolDefinition,
  type ToolContext,
} from '../src';

/** The api-contracts §6 table, row by row: tool → callers. */
const CONTRACT: Readonly<Record<string, string>> = {
  places_search: 'CGDR',
  place_details: 'CGDR',
  crowd_forecast: 'CDR',
  weather: 'CGRB',
  marine: 'CGRB',
  route_eta: 'CGR',
  fare_calendar: 'CDB',
  flight_status: 'CRB',
  fx: 'CG',
  crew_profiles: 'CGDR',
  plan_read: 'CGDRB',
  bookings_read: 'CGRB',
  balances_read: 'CGB',
  cost_quote: 'CGDR',
  fit_check: 'CD',
  bookable_activity: 'CG',
  ride_quote: 'CG',
  phrase_card: 'CGB',
  help_context: 'C',
  propose_plan_changes: 'CGRD',
  create_vote_draft: 'CG',
  propose_expense: 'G',
  propose_hold: 'CG',
  propose_vendor_message: 'CR',
  schedule_nudge: 'GB',
  web_search: 'CR',
};

const STRICT_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  'allOf',
  'description',
  'format',
  'minItems',
  'default',
]);

function assertStrict(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertStrict(child, `${path}[${index}]`));
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const schema = node as Record<string, unknown>;
  for (const key of Object.keys(schema)) {
    expect(STRICT_KEYWORDS.has(key), `${path}: unsupported keyword ${key}`).toBe(true);
  }
  if (schema.type === 'object') expect(schema.additionalProperties, path).toBe(false);
  if ('minItems' in schema) expect([0, 1]).toContain(schema.minItems);
  if (schema.properties !== undefined) {
    for (const [name, child] of Object.entries(schema.properties as Record<string, unknown>)) {
      assertStrict(child, `${path}.${name}`);
    }
  }
  for (const key of ['items', 'anyOf', 'allOf'] as const) {
    if (schema[key] !== undefined) assertStrict(schema[key], `${path}.${key}`);
  }
}

const context = (caller: ToolContext['caller']): ToolContext => ({
  uid: '0199a000-0000-7000-8000-000000000001',
  tripId: '0199a000-0000-7000-8000-000000000002',
  caller,
  route: 'guide.chat',
});

describe('tool schemas', () => {
  it('covers every tool of the contract table with its callers', () => {
    expect([...TOOL_NAMES].sort()).toEqual(Object.keys(CONTRACT).sort());
    for (const name of TOOL_NAMES) expect(TOOL_SPECS[name].callers.join('')).toBe(CONTRACT[name]);
  });

  it.each(TOOL_NAMES)('%s is a strict object schema', (name) => {
    const tool = toolDefinition(name);
    expect(tool.strict).toBe(true);
    expect(tool.input_schema.type).toBe('object');
    assertStrict(tool.input_schema, name);
  });

  it('lets draft tools return only draft or change-set ids and their checks', () => {
    const allowed = new Set(['draft_id', 'changeset_id', 'violations', 'cost_delta', 'sent']);
    const drafts = TOOL_NAMES.filter((name) => TOOL_SPECS[name].effect === 'draft');
    expect(
      drafts.every(
        (name) =>
          name.startsWith('propose_') || name.endsWith('_draft') || name === 'schedule_nudge',
      ),
    ).toBe(true);
    for (const name of drafts) {
      const shape = TOOL_SPECS[name].output.toJSONSchema() as { properties: object };
      for (const key of Object.keys(shape.properties))
        expect(allowed.has(key), `${name}.${key}`).toBe(true);
    }
  });
});

describe('allow-lists', () => {
  it('gives parsers no tool at all, and every other surface only its contract tools', () => {
    expect(TOOL_ALLOW_LISTS.M).toEqual([]);
    expect(routeTools(resolveRoute('email.parse'))).toEqual([]);
    expect(routeTools(resolveRoute('receipt.parse'))).toEqual([]);
    for (const caller of AI_CALLERS) {
      for (const name of allowedTools(caller)) expect(CONTRACT[name]).toContain(caller);
    }
    expect(allowedTools('C')).not.toContain('propose_expense');
    expect(allowedTools('B')).not.toContain('propose_plan_changes');
  });

  it('offers routes without a caller class no tools', () => {
    expect(routeTools(resolveRoute('micro.line'))).toEqual([]);
  });

  it('offers web search only on routes that switch it on', () => {
    const names = (route: Parameters<typeof resolveRoute>[0]) =>
      routeTools(resolveRoute(route)).map((tool) => tool.name);
    expect(names('guest.guide')).toContain('web_search');
    expect(names('guide.chat')).not.toContain('web_search');
    expect(names('disruption.plan_b')).not.toContain('web_search');
  });
});

describe('tool registry', () => {
  it('answers TOOL_UNAVAILABLE for a tool with no executor', async () => {
    const registry = createToolRegistry();
    const result = await registry.execute(
      {
        id: 'toolu_1',
        name: 'weather',
        input: {
          lat: 1,
          lng: 2,
          from: '2026-11-02T00:00:00+07:00',
          to: '2026-11-03T00:00:00+07:00',
        },
      },
      context('C'),
    );
    expect(result).toMatchObject({ ok: false, failure: 'TOOL_UNAVAILABLE' });
    expect(result.block).toMatchObject({ tool_use_id: 'toolu_1', is_error: true });
    expect(result.block.content as string).toContain('cannot check');
  });

  it('refuses tools outside the surface allow-list and unknown names', async () => {
    const registry = createToolRegistry();
    registry.registerToolExecutor('propose_expense', () =>
      Promise.resolve({ draft_id: '0199a000-0000-7000-8000-00000000000a' }),
    );
    const input = {
      trip_id: context('C').tripId,
      amount_minor: 100,
      currency: 'VND',
      payer_uid: context('C').uid,
      split: { mode: 'equal', members: [] },
    };
    expect(
      await registry.execute({ id: 't', name: 'propose_expense', input }, context('C')),
    ).toMatchObject({ failure: 'TOOL_NOT_ALLOWED' });
    expect(
      await registry.execute({ id: 't', name: 'book_now', input: {} }, context('C')),
    ).toMatchObject({ failure: 'TOOL_NOT_ALLOWED' });
    expect(
      await registry.execute({ id: 't', name: 'propose_expense', input }, context('G')),
    ).toMatchObject({ ok: true });
  });

  it('validates input before and output after the executor', async () => {
    const registry = createToolRegistry();
    const errors: string[] = [];
    const reg = createToolRegistry((name) => errors.push(name));
    registry.registerToolExecutor('fx', (input) =>
      Promise.resolve({
        amount_minor: input.amount_minor * 2,
        rate: 2,
        snapshot_id: '0199a000-0000-7000-8000-00000000000b',
      }),
    );
    reg.registerToolExecutor('fx', () =>
      Promise.resolve({ amount_minor: 1.5, rate: 2, snapshot_id: 'x' } as never),
    );
    const ok = await registry.execute(
      { id: 'a', name: 'fx', input: { amount_minor: 5, from: 'USD', to: 'VND' } },
      context('C'),
    );
    expect(ok).toMatchObject({ ok: true, output: { amount_minor: 10 } });
    expect(JSON.parse(ok.block.content as string)).toMatchObject({ rate: 2 });
    const bad = await registry.execute(
      { id: 'b', name: 'fx', input: { amount_minor: '5' } },
      context('C'),
    );
    expect(bad).toMatchObject({ failure: 'TOOL_INPUT_INVALID' });
    const wrongOut = await reg.execute(
      { id: 'c', name: 'fx', input: { amount_minor: 5, from: 'USD', to: 'VND' } },
      context('C'),
    );
    expect(wrongOut).toMatchObject({ failure: 'TOOL_UNAVAILABLE' });
    expect(errors).toEqual(['fx']);
  });

  it('refuses a second executor for the same tool', () => {
    const registry = createToolRegistry();
    const fn = () => Promise.resolve({ draft_id: null, sent: false });
    registry.registerToolExecutor('schedule_nudge', fn);
    expect(() => registry.registerToolExecutor('schedule_nudge', fn)).toThrow(
      /already registered/u,
    );
  });
});
