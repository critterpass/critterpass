/* eslint-disable lingui/no-unlocalized-strings -- every string literal below is either a DSL token
   (design/*.dc.html syntax) or a developer-facing parse-error thrown for a malformed `kf` string,
   never rendered copy. */
import type { RawKeyframeAssignments, RawKeyframeStop } from './types';

const PROPERTY_KEYS = ['tx', 'ty', 'sx', 'sy', 's', 'r', 'o'] as const;
type PropertyKey = (typeof PROPERTY_KEYS)[number];

type ParsedToken =
  | { readonly kind: 'property'; readonly key: PropertyKey; readonly value: number }
  | { readonly kind: 'easing'; readonly alias: string };

/** `PROPERTY_KEYS` is ordered longest-prefix-first so `sx`/`sy` never get mistaken for `s`. */
function parseAssignmentToken(token: string): ParsedToken {
  if (token.startsWith('e=')) {
    const alias = token.slice(2);
    if (alias.length === 0) {
      throw new Error(`tg-motion DSL: empty easing alias in "${token}"`);
    }
    return { kind: 'easing', alias };
  }
  const key = PROPERTY_KEYS.find((candidate) => token.startsWith(candidate));
  if (!key) {
    throw new Error(`tg-motion DSL: unrecognised keyframe token "${token}"`);
  }
  const value = Number(token.slice(key.length));
  if (!Number.isFinite(value)) {
    throw new Error(`tg-motion DSL: invalid numeric value in token "${token}"`);
  }
  return { kind: 'property', key, value };
}

function parseSegment(segment: string): RawKeyframeStop {
  const colonIndex = segment.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`tg-motion DSL: keyframe segment missing ":" in "${segment}"`);
  }
  const atText = segment.slice(0, colonIndex);
  const at = Number(atText);
  if (!Number.isFinite(at) || at < 0 || at > 1) {
    throw new Error(`tg-motion DSL: keyframe time must be between 0 and 1, got "${atText}"`);
  }

  const tokens = segment
    .slice(colonIndex + 1)
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const assignments: { -readonly [K in keyof RawKeyframeAssignments]?: RawKeyframeAssignments[K] } =
    {};
  for (const token of tokens) {
    const parsed = parseAssignmentToken(token);
    if (parsed.kind === 'easing') {
      assignments.easingAlias = parsed.alias;
    } else {
      assignments[parsed.key] = parsed.value;
    }
  }
  return { at, assignments };
}

/**
 * Parses one `tg-motion` `kf` attribute string (design/*.dc.html, format `offset: tx ty s sx sy r o
 * e=`) into raw, unresolved stops — no carry-forward yet, so a stop's `assignments` only holds the
 * props it explicitly mentions.
 */
export function parseKeyframes(kf: string): readonly RawKeyframeStop[] {
  const segments = kf
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error('tg-motion DSL: empty keyframe string');
  }
  return segments.map(parseSegment);
}
