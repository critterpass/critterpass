/**
 * Every message kind the server writes into crew chat draws as a real card in the app: the test
 * reads each `INSERT INTO messages` in the server sources, collects the `type` it writes, loads the
 * card registrations the root layout loads, and checks each kind has a renderer (text and system
 * rows the chat draws itself). A kind posted with a bound parameter is a member's own message.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The device's session and database open native SQLite; only the card registrations run here.
jest.mock('@/data/app-session/device-session', () => ({
  sessionHeaders: () => Promise.resolve({}),
}));
jest.mock('@/data/powersync/db', () => ({}));
// The store's SDK is never called here.
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { describe, expect, it, jest } from '@jest/globals';
import { MEMBER_MESSAGE_TYPES, MESSAGE_TYPES } from '@cp/domain';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chatCard } from '@/features/crew/chat/cards/registry';
import '@/features/crew/chat/media/register';
import '@/features/guide/chat/register';
import '@/features/monetize/register';
import '@/features/money/chat/register';
import '@/features/plan/review/register-chat-card';
import '@/features/proposal/register';
import '@/features/vote/register';

/** The modules that register chat cards: the root layout loads each (the chat screen, its media). */
const CARD_REGISTRATIONS = [
  '@/features/vote/register',
  '@/features/guide/chat/register',
  '@/features/money/chat/register',
  '@/features/monetize/register',
  '@/features/plan/review/register-chat-card',
  '@/features/proposal/register',
];

const DRAWN_BY_THE_CHAT = new Set(['text', 'system']);

function repoRoot(): string {
  let dir = __dirname;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) dir = resolve(dir, '..');
  return dir;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === 'dev') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (/\.test\.ts$|test-support/u.test(path)) return [];
    return /\.(ts|sql)$/u.test(name) ? [path] : [];
  });
}

/** Splits a SQL list on top-level commas (ignoring those inside parentheses or quotes). */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const char of list) {
    if (char === "'") quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (!quoted && depth === 0 && char === ',') {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts;
}

/** The list inside the parentheses that open at `from`. */
function parenthesised(text: string, from: number): string {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    if (depth === 0) return text.slice(from + 1, i);
  }
  return '';
}

function serverWrittenKinds(): { kinds: Set<string>; inserts: number } {
  const root = repoRoot();
  const files = [
    ...sourceFiles(join(root, 'services')),
    ...sourceFiles(join(root, 'packages/ai/src')),
    ...sourceFiles(join(root, 'packages/db/migrations')),
  ];
  const kinds = new Set<string>();
  let inserts = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/INSERT INTO (?:public\.)?messages\s*\(/giu)) {
      const columns = splitList(parenthesised(text, match.index + match[0].length - 1));
      const valuesAt = text.slice(match.index).search(/VALUES\s*\(/iu);
      const open = text.indexOf('(', match.index + valuesAt);
      const values = splitList(parenthesised(text, open));
      const type = values[columns.indexOf('type')];
      if (type === undefined) throw new Error(`no type column in ${file}`);
      inserts += 1;
      const literal = /^'([a-z_]+)'$/u.exec(type)?.[1];
      for (const kind of literal === undefined ? MEMBER_MESSAGE_TYPES : [literal]) kinds.add(kind);
    }
  }
  return { kinds, inserts };
}

describe('chat message kinds the server writes', () => {
  it('each has a card renderer in the app', () => {
    const { kinds, inserts } = serverWrittenKinds();
    expect(inserts).toBeGreaterThan(3);
    expect(kinds).toContain('expense');
    for (const kind of kinds) expect(MESSAGE_TYPES).toContain(kind);
    const missing = [...kinds].filter(
      (kind) => !DRAWN_BY_THE_CHAT.has(kind) && chatCard(kind) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('the root layout loads every card registration', () => {
    const layout = readFileSync(join(repoRoot(), 'apps/mobile/src/app/_layout.tsx'), 'utf8');
    for (const module of CARD_REGISTRATIONS) expect(layout).toContain(`import '${module}';`);
  });
});
