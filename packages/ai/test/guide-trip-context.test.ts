/**
 * The guide works in its thread's trip and crew. The prompt carries no ids, so a tool that asked
 * the model for one left it nothing to send but a question back to the traveller ("what's your
 * trip code?"). The trip and crew come from the turn: they are never part of the schema the model
 * fills, and the registry binds them from the turn's context before the executor runs.
 */
import { describe, expect, it } from 'vitest';

import {
  createToolRegistry,
  guideChatTools,
  resolveRoute,
  routeTools,
  type ToolContext,
} from '../src';

const TRIP = '0199a000-0000-7000-8000-000000000002';
const CREW = '0199a000-0000-7000-8000-000000000003';
const OTHER_TRIP = '0199a000-0000-7000-8000-0000000000ff';
const VERSION = '0199a000-0000-7000-8000-000000000004';

const context: ToolContext = {
  uid: '0199a000-0000-7000-8000-000000000001',
  tripId: TRIP,
  crewId: CREW,
  caller: 'C',
  route: 'guide.chat',
};

function keysOf(schema: unknown): string[] {
  const node = schema as { properties?: Record<string, unknown>; required?: string[] };
  return [...Object.keys(node.properties ?? {}), ...(node.required ?? [])];
}

describe('guide tools take the trip and crew from the turn', () => {
  it.each(['guide.chat', 'guide.voice', 'guide.crew_mention', 'guide.chat_escalation'] as const)(
    '%s asks the model for no trip or crew id',
    (route) => {
      for (const tool of routeTools(resolveRoute(route))) {
        expect(keysOf(tool.input_schema), tool.name).not.toContain('trip_id');
        expect(keysOf(tool.input_schema), tool.name).not.toContain('crew_id');
      }
    },
  );

  it('still offers the plan tools in guide chat', () => {
    expect(guideChatTools()).toEqual(
      expect.arrayContaining(['plan_read', 'propose_plan_changes', 'places_search']),
    );
  });

  it("runs a trip tool in the turn's trip, whatever the model sent", async () => {
    const registry = createToolRegistry();
    const seen: string[] = [];
    registry.registerToolExecutor('plan_read', (input) => {
      seen.push(input.trip_id);
      return Promise.resolve({ version: VERSION, days: [] });
    });
    const bare = await registry.execute({ id: 'a', name: 'plan_read', input: { day: 1 } }, context);
    const spoofed = await registry.execute(
      { id: 'b', name: 'plan_read', input: { trip_id: OTHER_TRIP } },
      context,
    );
    expect(bare).toMatchObject({ ok: true });
    expect(spoofed).toMatchObject({ ok: true });
    expect(seen).toEqual([TRIP, TRIP]);
  });

  it('binds the crew of the turn for a crew tool', async () => {
    const registry = createToolRegistry();
    let crew: string | undefined;
    registry.registerToolExecutor('create_vote_draft', (input) => {
      crew = input.crew_id;
      return Promise.resolve({ draft_id: VERSION });
    });
    const result = await registry.execute(
      {
        id: 'c',
        name: 'create_vote_draft',
        input: {
          question: 'Beach or market?',
          options: ['Beach', 'Market'],
          closes_at: '2026-10-03T12:00:00+07:00',
        },
      },
      context,
    );
    expect(result).toMatchObject({ ok: true });
    expect(crew).toBe(CREW);
  });

  it('answers a trip tool outside a trip as unavailable, not as bad input', async () => {
    const registry = createToolRegistry();
    registry.registerToolExecutor('plan_read', () =>
      Promise.resolve({ version: VERSION, days: [] }),
    );
    const result = await registry.execute(
      { id: 'd', name: 'plan_read', input: {} },
      { ...context, tripId: null, crewId: null },
    );
    expect(result).toMatchObject({ ok: false, failure: 'TOOL_UNAVAILABLE' });
  });
});
