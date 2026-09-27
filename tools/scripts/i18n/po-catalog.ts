/**
 * Minimal, read-only `.po` reader scoped to what this pipeline needs: a message id's translation
 * (empty when untranslated), its extracted comment (`#.`, the macro's own `comment` field) and its
 * source references (`#:`). Not a general gettext parser — `packages/i18n` (which owns
 * `@lingui/format-po` as a real dependency) is the authority on catalog format; this file exists
 * because `tools/scripts/package.json` is outside this phase's file ownership, so this script
 * cannot declare that dependency itself (see the report's open-issue note recommending that once
 * someone can touch that file).
 */

export interface PoEntry {
  readonly id: string;
  readonly translation: string;
  /** `#.` lines (Lingui's own `comment` macro field) — translator-facing context, e.g. which screen a string appears on. */
  readonly comment?: string;
  /** `#:` lines — source file(s) the message was extracted from. */
  readonly references: readonly string[];
}

const MSGID_LINE = /^msgid\s+"(.*)"$/;
const MSGSTR_LINE = /^msgstr\s+"(.*)"$/;
const CONTINUATION_LINE = /^"(.*)"$/;
const EXTRACTED_COMMENT_LINE = /^#\.\s?(.*)$/;
const REFERENCE_LINE = /^#:\s?(.*)$/;

function unescape(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function readContinuations(lines: readonly string[], start: number, initial: string): [string, number] {
  let value = initial;
  let index = start;
  while (index < lines.length) {
    const continuation = CONTINUATION_LINE.exec(lines[index]?.trim() ?? '');
    if (!continuation) break;
    value += unescape(continuation[1] ?? '');
    index += 1;
  }
  return [value, index];
}

/** Reads every `msgid`/`msgstr` pair (plus their preceding `#.`/`#:` comments) from a `.po` file's
 * content, in file order. Skips the header entry (empty msgid) and joins gettext's quoted-string
 * continuation lines. */
export function readPoEntries(content: string): PoEntry[] {
  const entries: PoEntry[] = [];
  const lines = content.split('\n');
  let index = 0;
  let pendingComment: string | undefined;
  let pendingReferences: string[] = [];

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? '';

    const commentMatch = EXTRACTED_COMMENT_LINE.exec(line);
    if (commentMatch) {
      pendingComment = commentMatch[1];
      index += 1;
      continue;
    }
    const referenceMatch = REFERENCE_LINE.exec(line);
    if (referenceMatch && referenceMatch[1] !== undefined) {
      pendingReferences.push(referenceMatch[1]);
      index += 1;
      continue;
    }

    const idMatch = MSGID_LINE.exec(line);
    if (!idMatch) {
      index += 1;
      continue;
    }

    let id: string;
    [id, index] = readContinuations(lines, index + 1, unescape(idMatch[1] ?? ''));

    const strMatch = MSGSTR_LINE.exec(lines[index]?.trim() ?? '');
    let translation = '';
    if (strMatch) {
      [translation, index] = readContinuations(lines, index + 1, unescape(strMatch[1] ?? ''));
    }

    if (id !== '') {
      entries.push({
        id,
        translation,
        ...(pendingComment !== undefined ? { comment: pendingComment } : {}),
        references: pendingReferences,
      });
    }
    pendingComment = undefined;
    pendingReferences = [];
  }

  return entries;
}
