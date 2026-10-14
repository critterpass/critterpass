/**
 * Reading the researchers' JSON-lines files: a path names one file or a folder of them, and a line
 * that does not parse or fails its schema is reported by its number and left out.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { z } from 'zod';

/** The `.jsonl` files the paths name: each file itself, or every one in a folder. */
export function jsonlFiles(paths: readonly string[]): string[] {
  return paths.flatMap((path) =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.jsonl'))
          .sort()
          .map((name) => join(path, name))
      : [path],
  );
}

export interface ParsedRows<T> {
  readonly rows: readonly T[];
  readonly rejected: readonly { readonly line: number; readonly reason: string }[];
}

/** Reads a JSON-lines text with `schema`; a line that fails is reported by its number. */
export function parseJsonLines<T>(text: string, schema: z.ZodType<T>): ParsedRows<T> {
  const rows: T[] = [];
  const rejected: { line: number; reason: string }[] = [];
  text.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      rejected.push({ line: index + 1, reason: 'not JSON' });
      return;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) rows.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      rejected.push({
        line: index + 1,
        reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`,
      });
    }
  });
  return { rows, rejected };
}
