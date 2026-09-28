/**
 * Shared by the safety kinds: search results as numbered sources for the prompt, the cite-only
 * rule (a record's link must be one of the results) and the check that a number really appears in
 * the source it cites, so the model can structure numbers but never invent them.
 */
import type { ResearchHit } from '../../search';

export function sourcesBlock(hits: readonly ResearchHit[]): string {
  return hits.length === 0
    ? '(no results)'
    : hits
        .map((h, i) => `[${i + 1}] ${h.url}\n${h.title}: ${h.content.replace(/\s+/gu, ' ')}`)
        .join('\n');
}

export function citedHit(
  hits: readonly ResearchHit[],
  url: string | null,
): ResearchHit | undefined {
  return url === null || !url.startsWith('https://')
    ? undefined
    : hits.find((hit) => hit.url === url);
}

/** The number, as a whole digit run, appears in the source's text (spaces and dashes inside ignored). */
export function numberInSource(hit: ResearchHit, number: string): boolean {
  const wanted = number.replace(/\D/gu, '');
  if (wanted.length === 0) return false;
  const text = hit.content.replace(/(?<=\d)[\s\-().]+(?=\d)/gu, '');
  return new RegExp(`(?<!\\d)${wanted}(?!\\d)`, 'u').test(text);
}

export function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function checklistTable(
  title: string,
  rows: readonly (readonly string[])[],
  header: readonly string[],
): string {
  return [
    `# ${title}`,
    '',
    'Check each record against its source and the official page, then record the verification.',
    '',
    `| | ${header.join(' | ')} |`,
    `|---|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| [ ] | ${row.join(' | ')} |`),
    '',
  ].join('\n');
}
