/**
 * The `menu` eval suite (`pnpm --filter @cp/ai eval menu`): menus as a phone reads them
 * (cases.yaml), run through the real `readMenu` (prompt, gateway, validator, code-read prices);
 * only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when the dishes
 * it names came back on their own lines and its headings did not, every member got the verdict
 * the case expects (a clash is never missed), flags name only members the case lists, no model
 * text carries a digit, the menu's language is told, and every price is the one the code reads
 * from the menu's print. Seeded cases grade the validator on a deliberate slip, in both modes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  menuReplySchema,
  readMenu,
  validateMenuReply,
  type MenuLine,
  type ParsedMenu,
} from '../../src/routes/camera';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const MENU_SUITE = 'menu';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases.yaml', import.meta.url));

const verdictSchema = z.object({ line: z.string(), member: z.string() });
const caseSchema = z.object({
  id: z.string().regex(/^menu-\d{2}$/u),
  description: z.string(),
  locale: z.string(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .optional(),
  lines: z.array(z.string().regex(/^[a-z]\d+: .+$/u)).min(1),
  crew: z.array(z.object({ first_name: z.string(), flags: z.array(z.string()) })),
  dishes: z.array(z.string()).default([]),
  not_dishes: z.array(z.string()).default([]),
  clash: z.array(verdictSchema).default([]),
  ok: z.array(verdictSchema).default([]),
  no_flags: z.boolean().default(false),
  forbid: z.array(z.string()).default([]),
  language: z.string().optional(),
  /** Dish line id → the printed amount in minor units. */
  prices: z.record(z.string(), z.number().int()).default({}),
  seeded: z.boolean().default(false),
  reply: menuReplySchema.optional(),
  expect_items: z.array(z.string()).optional(),
});
type MenuCase = z.infer<typeof caseSchema>;

export interface MenuSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadMenuCases(): MenuCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8')) as unknown);
}

/** The case's lines with the boxes a phone would give: a `p` line sits on its dish's row. */
export function linesOf(c: MenuCase): MenuLine[] {
  let row = 0;
  return c.lines.map((entry) => {
    const [id = '', ...rest] = entry.split(': ');
    const price = id.startsWith('p');
    if (!price) row += 1;
    return {
      id,
      text: rest.join(': '),
      bbox: price ? [0.8, row * 0.08, 0.15, 0.04] : [0.05, row * 0.08, 0.5, 0.04],
    };
  });
}

function transport(c: MenuCase, options: MenuSuiteOptions): typeof fetch {
  const file = resolve(FIXTURES, `${c.id}.json`);
  if (options.mode === 'replay') {
    return () => {
      const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
        response: { status: number; body: unknown };
      };
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  return async (url, init) => {
    const response = await fetch(url, init);
    if (options.record === true) {
      const body = (await response.clone().json()) as unknown;
      mkdirSync(FIXTURES, { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}

async function run(c: MenuCase, options: MenuSuiteOptions): Promise<ParsedMenu> {
  const lines = linesOf(c);
  const hint = c.currency === undefined ? {} : { currencyHint: c.currency };
  if (c.seeded) {
    return validateMenuReply(c.reply ?? { items: [], suggestion: null }, {
      lines,
      crew: c.crew,
      ...hint,
    });
  }
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return readMenu(gateway, { lines, crew: c.crew, locale: c.locale, ...hint });
}

const DIGIT = /[\d０-９]/u;

export function gradeMenu(c: MenuCase, menu: ParsedMenu): string[] {
  const failures: string[] = [];
  if (menu.status !== 'ok') return [`status ${menu.status}`];
  const items = new Map(menu.items.map((item) => [item.ocr_line_id, item]));
  if (c.expect_items !== undefined) {
    const kept = [...items.keys()].sort().join(' ');
    if (kept !== [...c.expect_items].sort().join(' ')) failures.push(`kept [${kept}]`);
  }
  for (const id of c.dishes) if (!items.has(id)) failures.push(`no dish on ${id}`);
  for (const id of c.not_dishes) if (items.has(id)) failures.push(`${id} is not a dish`);
  const members = new Set(c.crew.map((member) => member.first_name));
  const verdict = (line: string, member: string) =>
    items.get(line)?.flags.find((flag) => flag.member === member)?.verdict;
  for (const { line, member } of c.clash) {
    if (verdict(line, member) !== 'clash') failures.push(`${line}: no clash for ${member}`);
  }
  for (const { line, member } of c.ok) {
    if (verdict(line, member) !== 'ok') failures.push(`${line}: not ok for ${member}`);
  }
  const prose: string[] = menu.suggestion === null ? [] : [menu.suggestion];
  for (const item of menu.items) {
    prose.push(item.translation, item.description);
    for (const flag of item.flags) {
      prose.push(flag.reason);
      if (!members.has(flag.member)) failures.push(`${item.ocr_line_id}: flag for ${flag.member}`);
    }
    if (c.no_flags && item.flags.length > 0) failures.push(`${item.ocr_line_id}: flagged`);
    const expected = c.prices[item.ocr_line_id];
    if (expected !== undefined && item.price?.amount_minor !== expected) {
      failures.push(`${item.ocr_line_id}: price ${item.price?.amount_minor ?? 'none'}`);
    }
  }
  const text = prose.join('\n');
  if (DIGIT.test(text)) failures.push('a number in the model text');
  const lower = text.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  if (c.language !== undefined && menu.source_language?.split('-')[0] !== c.language) {
    failures.push(`language ${menu.source_language ?? 'none'}`);
  }
  return failures;
}

export async function runMenuSuite(
  options: MenuSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadMenuCases()) {
    const menu = await run(c, options);
    const failures = gradeMenu(c, menu);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'menu', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'menu', outcome: 'fail' as const, reason })),
      output: menu.items
        .map(
          (item) =>
            `${item.ocr_line_id}: ${item.translation}${item.flags
              .map((flag) => ` [${flag.member} ${flag.verdict}]`)
              .join('')}`,
        )
        .join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: MENU_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
