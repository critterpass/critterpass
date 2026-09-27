/**
 * Stable content hash for a quote set: the same priced content always yields the same version,
 * on the server, on a phone or in a Worker, without Web Crypto's async API. Components are
 * serialised canonically (sorted keys, bigint as decimal strings) and sorted, so the version does
 * not depend on the order a loader happened to return rows in.
 */
import { type CostComponent } from './quote-set';

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/** FNV-1a 64-bit over the UTF-8 bytes of `text`, as 16 lowercase hex digits. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

/** Canonical JSON for any engine value: key order and bigint encoding never change a hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/**
 * The priced content of a component. `frozenAt` is excluded: freezing pins a set, it does not
 * change a single number, so a poll opened on a set keeps the version it was shown with.
 */
function pricedContent(component: CostComponent): unknown {
  const { frozenAt: _frozenAt, ...content } = component;
  return content;
}

/** `qv_` + 16 hex digits; changes iff any component's priced content changes. */
export function quoteSetVersion(components: readonly CostComponent[]): string {
  const rows = components.map((component) => canonicalJson(pricedContent(component))).sort();
  return `qv_${fnv1a64(rows.join('\n'))}`;
}
