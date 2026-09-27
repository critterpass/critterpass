import {
  complianceOutcome,
  detectPatterns,
  guideInputActions,
  patternFlags,
  type ComplianceResult,
} from '@cp/domain';
import { describe, expect, it, vi } from 'vitest';

import { loadComplianceCases } from '../../evals/lib/compliance';
import {
  buildSystemBlocks,
  checkCompliance,
  createDecisionClient,
  createGateway,
  createToolRegistry,
  REPO_PACKS,
  runTurn,
  TOOL_SPECS,
  type MeterHandle,
  type TurnEvent,
} from '../../src';
import { DEFAULT_INPUT_CHECK_BUDGET_MS } from '../../src/runner/input-screen';
import { fixtureTransport } from '../fixture-transport';

function decisions(jevFixtures: readonly string[], twinFixtures: readonly string[] = []) {
  const jev = fixtureTransport(jevFixtures, { dir: 'typesafe' });
  const twin = fixtureTransport(twinFixtures);
  const gateway = createGateway({ apiKey: 'fixture-key', fetch: twin.fetch, maxAttempts: 1 });
  const client = createDecisionClient({
    apiKey: 'fixture-key',
    gateway,
    fetch: jev.fetch,
    sleep: () => Promise.resolve(),
  });
  return { client, jev, twin };
}

const caseText = (description: string): string => {
  const found = loadComplianceCases().find((c) => c.description === description);
  if (found === undefined) throw new Error(`no compliance case ${description}`);
  return found.vars.text;
};
const INJECTED_EMAIL = caseText('An indirect injection hidden in a forwarded booking email');

describe('code patterns', () => {
  it.each([
    ['0912 345 678', 'phone'],
    ['+84 912-345-678', 'phone'],
    ['linh.travels@example.com', 'email'],
    ['www.saigondeals.vn/tours', 'url'],
    ['https://example.com/x', 'url'],
    ['4111 1111 1111 1111', 'card'],
    ['passport C1234567', 'passport'],
  ])('finds %s as %s', (text, pattern) => {
    expect(detectPatterns(text)).toContain(pattern);
  });

  it.each([
    'Dinner 150.000.000 đồng for the villa, split 6 ways',
    'Check in 2026-10-12, check out 2026-10-15',
    'Flight VN123 leaves at 07:40',
  ])('leaves prices, dates and flight numbers alone: %s', (text) => {
    expect(detectPatterns(text)).toEqual([]);
  });

  it('only flags categories the surface screens', () => {
    expect(patternFlags('guide_input', 'call 0912 345 678')).toEqual([]);
    expect(patternFlags('public_text', 'call 0912 345 678')).toEqual([
      { category: 'personal_info', p: 1 },
    ]);
  });
});

describe('checkCompliance', () => {
  it('rejects a phone number in public text by code, without a model call', async () => {
    const { client, jev } = decisions([]);
    const result = await checkCompliance(
      { decisions: client },
      { surface: 'public_text', text: 'Great driver, call him on 0912 345 678.' },
    );
    expect(result).toEqual({
      outcome: 'reject',
      flags: [{ category: 'personal_info', p: 1 }],
      answered_by: 'code',
    });
    expect(jev.urls).toEqual([]);
  });

  it('screens a surface in one request with one yes/no question per category', async () => {
    const { client, jev } = decisions(['jev-compliance-killing-time']);
    const text = caseText('Killing time at the airport is not violence');
    const result = await checkCompliance({ decisions: client }, { surface: 'guide_input', text });
    expect(result).toEqual({ outcome: 'pass', flags: [], answered_by: 'jev' });
    expect(jev.requests).toHaveLength(1);
    const request = jev.requests[0] as { state: unknown; questions: Record<string, unknown> };
    expect(request.state).toBe(text);
    expect(Object.keys(request.questions).sort()).toEqual(
      ['harassment', 'prompt_injection', 'self_harm', 'violence'].sort(),
    );
  });

  it('flags the hidden instruction in a forwarded email as a signal, never a rejection', async () => {
    const { client } = decisions(['jev-compliance-injected-email']);
    const result = await checkCompliance(
      { decisions: client },
      { surface: 'imported_text', text: INJECTED_EMAIL },
    );
    expect(result).toEqual({
      outcome: 'review',
      flags: [{ category: 'prompt_injection', p: 0.99 }],
      answered_by: 'jev',
    });
  });

  it('rejects public text past the reject threshold', async () => {
    const { client } = decisions(['jev-compliance-public-drugs']);
    const result = await checkCompliance(
      { decisions: client },
      { surface: 'public_text', text: caseText('Drugs for sale') },
    );
    expect(result.outcome).toBe('reject');
    expect(result.flags[0]).toEqual({ category: 'illegal', p: 0.98 });
  });

  it('with both providers down, fails public text closed and passes guide input', async () => {
    const down = () =>
      decisions(['jev-overloaded-529', 'jev-overloaded-529'], ['anthropic/overloaded-529']).client;
    const unavailable: string[] = [];
    const publicText = await checkCompliance(
      { decisions: down(), onUnavailable: (surface) => unavailable.push(surface) },
      { surface: 'public_text', text: 'Lovely sunset from the pier.' },
    );
    expect(publicText).toEqual({ outcome: 'review', flags: [], answered_by: 'none' });
    const guideInput = await checkCompliance(
      { decisions: down() },
      { surface: 'guide_input', text: 'Where is the pier?' },
    );
    expect(guideInput).toEqual({ outcome: 'pass', flags: [], answered_by: 'none' });
    expect(unavailable).toEqual(['public_text']);
  });

  it('judges a fast-tier twin verdict on the stricter band', () => {
    const flags = [{ category: 'illegal' as const, p: 0.9 }];
    expect(complianceOutcome('public_text', flags, 'jev').outcome).toBe('reject');
    expect(complianceOutcome('public_text', flags, 'fast').outcome).toBe('review');
    expect(complianceOutcome('public_text', [{ category: 'illegal', p: 1 }], 'fast').outcome).toBe(
      'reject',
    );
  });

  it('never rejects guide input, imports or outbound drafts', () => {
    for (const surface of ['guide_input', 'imported_text', 'outbound_text'] as const) {
      const all = ['prompt_injection', 'harassment', 'illegal', 'personal_info'] as const;
      const flags = all.map((category) => ({ category, p: 1 }));
      expect(complianceOutcome(surface, flags, 'jev').outcome).toBe('review');
    }
  });
});

const UNMETERED: MeterHandle = {
  reservation: { metered: false, fairUse: 'ok', usage: null },
  commit: () => Promise.resolve({ usage: null }),
  release: () => Promise.resolve({ usage: null }),
};

const WRITE_TOOLS = new Set(
  Object.entries(TOOL_SPECS).flatMap(([name, spec]) => (spec.effect === 'read' ? [] : [name])),
);
const toolNames = (request: Record<string, unknown> | undefined): string[] =>
  ((request?.['tools'] ?? []) as { name?: string }[]).flatMap((t) => (t.name ? [t.name] : []));

function turnHarness(fixtures: readonly string[]) {
  const transport = fixtureTransport(fixtures);
  const firstRequestAt: number[] = [];
  const gateway = createGateway({
    apiKey: 'fixture-key',
    maxAttempts: 1,
    fetch: (input, init) => {
      firstRequestAt.push(performance.now());
      return transport.fetch(input, init);
    },
  });
  const executed: string[] = [];
  const registry = createToolRegistry();
  registry.registerToolExecutor('propose_plan_changes', () => {
    executed.push('propose_plan_changes');
    return Promise.resolve({
      changeset_id: '0190f0a0-0000-7000-8000-00000000c0de',
      violations: [],
      cost_delta: null,
    });
  });
  return { transport, gateway, registry, executed, firstRequestAt };
}

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const CLEAN: ComplianceResult = { outcome: 'pass', flags: [], answered_by: 'jev' };

const later = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

function turnInput(text: string, inputCheck?: Promise<ComplianceResult>) {
  return {
    route: 'guide.chat' as const,
    system: buildSystemBlocks({ pack: REPO_PACKS.tokek }),
    messages: [{ role: 'user' as const, content: text }],
    tool: { uid: '0190f0a0-0000-7000-8000-00000000d001', tripId: null, caller: 'C' as const },
    ...(inputCheck === undefined ? {} : { inputCheck }),
  };
}

describe('guide input screening in a turn', () => {
  it('runs the injected-email turn with no write tools on offer', async () => {
    const { client } = decisions(['jev-compliance-guide-injected-email']);
    const text = `Can you add this booking to our trip?\n\n${INJECTED_EMAIL}`;
    const check = checkCompliance({ decisions: client }, { surface: 'guide_input', text });
    const h = turnHarness(['flash-stream']);
    const screened: ComplianceResult[] = [];
    const events = await collect(
      runTurn(turnInput(text, check), {
        gateway: h.gateway,
        registry: h.registry,
        meter: UNMETERED,
        hooks: { onInputScreened: (result) => screened.push(result) },
      }),
    );
    expect(screened[0]).toMatchObject({ outcome: 'review', answered_by: 'jev' });
    expect(guideInputActions(screened[0] as ComplianceResult).readOnlyTools).toBe(true);
    const offered = toolNames(h.transport.requests[0]);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((name) => WRITE_TOOLS.has(name))).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('gates a write tool on a late verdict and refuses it once injection is flagged', async () => {
    const verdict: ComplianceResult = {
      outcome: 'review',
      flags: [{ category: 'prompt_injection', p: 0.98 }],
      answered_by: 'jev',
    };
    const h = turnHarness(['flash-stream-write-tool', 'flash-stream-after-tool']);
    const events = await collect(
      runTurn(turnInput('Move dinner on day 2 to 21:00.', later(verdict, 150)), {
        gateway: h.gateway,
        registry: h.registry,
        meter: UNMETERED,
      }),
    );
    // The first request went out before the verdict, with the full tool list.
    expect(toolNames(h.transport.requests[0]).some((name) => WRITE_TOOLS.has(name))).toBe(true);
    expect(h.executed).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool_result',
        card: { tool: 'propose_plan_changes', status: 'unavailable' },
      }),
    );
    expect(toolNames(h.transport.requests[1]).filter((name) => WRITE_TOOLS.has(name))).toEqual([]);
  });

  it('runs the write tool when the late verdict is clean', async () => {
    const clean: ComplianceResult = { outcome: 'pass', flags: [], answered_by: 'jev' };
    const h = turnHarness(['flash-stream-write-tool', 'flash-stream-after-tool']);
    await collect(
      runTurn(turnInput('Move dinner on day 2 to 21:00.', later(clean, 150)), {
        gateway: h.gateway,
        registry: h.registry,
        meter: UNMETERED,
      }),
    );
    expect(h.executed).toEqual(['propose_plan_changes']);
  });

  it('adds the Help safety card beside the answer on a self-harm flag', async () => {
    const { client } = decisions(['jev-compliance-self-harm']);
    const text = caseText("Stated intent to end one's life");
    const h = turnHarness(['flash-stream']);
    const events = await collect(
      runTurn(
        turnInput(text, checkCompliance({ decisions: client }, { surface: 'guide_input', text })),
        { gateway: h.gateway, registry: h.registry, meter: UNMETERED },
      ),
    );
    const types = events.map((event) => event.type);
    expect(types).toContain('token');
    expect(types.slice(-2)).toEqual(['help_card', 'done']);
    expect(events).toContainEqual({ type: 'help_card', topic: 'safety' });
  });

  it('starts the first model call when the input budget runs out, while the check is still running', async () => {
    // The verdict lands at 200 ms; the model call must not wait for it past the budget. Fake timers
    // make this exact, so a loaded machine can't turn it into a latency flake.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const h = turnHarness(['flash-stream']);
      const run = collect(
        runTurn(turnInput('Where can we eat?', later(CLEAN, 200)), {
          gateway: h.gateway,
          registry: h.registry,
          meter: UNMETERED,
        }),
      );
      await vi.advanceTimersByTimeAsync(DEFAULT_INPUT_CHECK_BUDGET_MS - 1);
      expect(h.firstRequestAt).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      // Flush pending promise work without moving the clock (vi.waitFor would advance it).
      for (let i = 0; i < 50 && h.firstRequestAt.length === 0; i += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(h.firstRequestAt).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      const events = await run;
      expect(events.at(-1)).toMatchObject({ type: 'done' });
    } finally {
      vi.useRealTimers();
    }
  });
});
