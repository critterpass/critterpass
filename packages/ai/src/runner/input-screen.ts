/**
 * The guide-input verdict as a turn sees it: the compliance check runs beside the context build
 * and the turn reads its verdict the moment it settles, without ever failing on it (a rejected
 * check reads as unscreened, the same as no check at all).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ComplianceResult } from '@cp/domain';

import { isToolName, TOOL_SPECS } from '../tools/schemas';

export const DEFAULT_INPUT_CHECK_BUDGET_MS = 25;
/** Longest a write tool call or the safety card waits for a late verdict before going without. */
export const INPUT_VERDICT_WAIT_MS = 3_000;

const UNSCREENED: ComplianceResult = { outcome: 'pass', flags: [], answered_by: 'none' };

export function isWriteTool(name: string): boolean {
  return isToolName(name) && TOOL_SPECS[name].effect !== 'read';
}

export const toolName = (tool: Anthropic.Messages.ToolUnion): string =>
  'name' in tool ? tool.name : '';

export interface InputScreen {
  /** Set once the check settles. */
  current: ComplianceResult | undefined;
  readonly settled: Promise<ComplianceResult>;
}

export function watchInput(
  check: Promise<ComplianceResult> | undefined,
  onVerdict: (result: ComplianceResult) => void,
): InputScreen {
  const screen: { current: ComplianceResult | undefined; settled?: Promise<ComplianceResult> } = {
    current: undefined,
  };
  const settled = (check ?? Promise.resolve(UNSCREENED))
    .catch(() => UNSCREENED)
    .then((result) => {
      screen.current = result;
      onVerdict(result);
      return result;
    });
  return Object.assign(screen, { settled });
}

/** Waits for `promise` at most `ms`. */
export async function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
