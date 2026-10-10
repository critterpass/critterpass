/** Serialises the resolved token tree to a standalone `export const tokens = {...} as const;` module. */
import type { Tokens } from '../src/types';
import { GENERATED_HEADER } from './generated-header';

export function serialize(value: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  const childPad = '  '.repeat(indent + 1);
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${childPad}${serialize(item, indent + 1)}`).join(',\n');
    return `[\n${items}\n${pad}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries
      .map(([key, v]) => `${childPad}${JSON.stringify(key)}: ${serialize(v, indent + 1)}`)
      .join(',\n');
    return `{\n${body}\n${pad}}`;
  }
  throw new Error(`design-tokens: cannot serialise a value of type ${typeof value} to TypeScript`);
}

export function emitTs(tokens: Tokens): string {
  return `${GENERATED_HEADER}\nexport const tokens = ${serialize(tokens, 0)} as const;\n`;
}
