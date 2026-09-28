import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  LEGAL_DOC_KEYS,
  LEGAL_DOCS,
  latestVersion,
  legalDocSchema,
  legalFrontmatterSchema,
  legalVersions,
} from './index';

const DIR = new URL('./', import.meta.url);

function frontmatter(doc: string, version: string): unknown {
  const text = readFileSync(new URL(`${doc}/${version}.mdx`, DIR), 'utf8');
  const block = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? '';
  const data: Record<string, unknown> = {};
  let listKey: string | null = null;
  for (const line of block.split('\n')) {
    const item = /^ {2}- (.*)$/u.exec(line);
    if (item !== null && listKey !== null) {
      (data[listKey] as string[]).push(item[1] ?? '');
      continue;
    }
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    listKey = value === '' ? (key ?? null) : null;
    if (key !== undefined) data[key] = value === '' ? [] : value.replace(/^'(.*)'$/u, '$1');
  }
  return data;
}

describe('legal registry', () => {
  it('describes every document with valid, newest-first, unique versions', () => {
    for (const doc of LEGAL_DOC_KEYS) {
      const entry = legalDocSchema.parse(LEGAL_DOCS[doc]);
      const versions = entry.versions.map((version) => version.version);
      expect(new Set(versions).size).toBe(versions.length);
      const dates = entry.versions.map((version) => version.effective_at);
      expect([...dates].sort().reverse()).toEqual(dates);
    }
  });

  it('has exactly one MDX file per registered version, whose frontmatter matches', () => {
    for (const doc of LEGAL_DOC_KEYS) {
      const files = readdirSync(new URL(`${doc}/`, DIR)).filter((file) => file.endsWith('.mdx'));
      const versions = LEGAL_DOCS[doc].versions.map((version) => `${version.version}.mdx`);
      expect(files.sort()).toEqual([...versions].sort());
      for (const version of LEGAL_DOCS[doc].versions) {
        const parsed = legalFrontmatterSchema.parse(frontmatter(doc, version.version));
        expect(parsed).toMatchObject({ doc, version: version.version });
      }
    }
  });

  it('exposes the current version of every document for the app', () => {
    const versions = legalVersions();
    expect(Object.keys(versions).sort()).toEqual([...LEGAL_DOC_KEYS].sort());
    expect(versions.privacy).toBe(latestVersion('privacy').version);
  });

  it('credits DB-IP on the privacy page', () => {
    const text = readFileSync(
      new URL(`privacy/${latestVersion('privacy').version}.mdx`, DIR),
      'utf8',
    );
    expect(text).toContain('<DbIpAttribution />');
  });
});
