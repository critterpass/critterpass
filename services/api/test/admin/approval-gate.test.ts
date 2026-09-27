/**
 * Every outbound ops path (a vendor message, a partner booking, a WhatsApp send) must pass the
 * user-approval gate. Any api source file that writes vendor messages or reaches a vendor channel has
 * to call `assertApproved`; a new path that forgets it fails here before it can ship.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../../src');
const OUTBOUND = [
  /INSERT\s+INTO\s+ops\.vendor_messages/i,
  /\bsendVendorMessage\b/,
  /\bsend_vendor_message\b/,
  /graph\.facebook\.com\/[^'"`]*\/messages/,
  /\bbookPartner\w*\(/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

describe('user-approval gate', () => {
  it('guards every outbound vendor or partner path with assertApproved', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(path.join('admin', 'desk.ts')))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return OUTBOUND.some((pattern) => pattern.test(text)) && !text.includes('assertApproved(');
      })
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it('keeps the gate itself exported for those paths', () => {
    const desk = readFileSync(path.join(SRC, 'admin', 'desk.ts'), 'utf8');
    expect(desk).toMatch(/export async function assertApproved\(/);
    expect(desk).toMatch(/APPROVAL_REQUIRED/);
  });
});
