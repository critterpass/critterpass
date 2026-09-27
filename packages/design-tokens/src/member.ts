/**
 * Assigns a member their colour and ring pattern by join order (design-system.md §1.2): the first
 * 6 members get the 6 accent colours solid; members 7-16 cycle the same palette with a ring
 * pattern (dashed, then double) so they stay distinguishable.
 */
import { tokens } from './validate';

export type RingPattern = 'solid' | 'dashed' | 'double';

export interface MemberStyle {
  readonly color: string;
  readonly pattern: RingPattern;
}

function assertRingPattern(value: string): asserts value is RingPattern {
  if (value !== 'solid' && value !== 'dashed' && value !== 'double') {
    throw new Error(`design-tokens: unknown member ring pattern "${value}"`);
  }
}

/** `joinIndex` is 0-based (the organiser/first member is 0); throws for a negative or non-integer index. */
export function resolveMemberStyle(joinIndex: number): MemberStyle {
  if (!Number.isInteger(joinIndex) || joinIndex < 0) {
    throw new Error(
      `design-tokens: resolveMemberStyle expects a non-negative integer join index, got ${joinIndex}`,
    );
  }
  const { colors, ringPatterns } = tokens.member;
  if (colors.length === 0 || ringPatterns.length === 0) {
    throw new Error('design-tokens: member colour palette or ring pattern list is empty');
  }
  const color = colors[joinIndex % colors.length];
  const pattern = ringPatterns[Math.floor(joinIndex / colors.length) % ringPatterns.length];
  if (color === undefined || pattern === undefined) {
    throw new Error('design-tokens: could not resolve a member style (unreachable)');
  }
  assertRingPattern(pattern);
  return { color, pattern };
}
