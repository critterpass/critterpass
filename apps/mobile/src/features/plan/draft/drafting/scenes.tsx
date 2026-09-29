/** The drafting screen (3c-8) and its states over the Kyoto fixture, for the developer scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- scene names, never copy. */
import {
  DAY_CARDS,
  STEPS_FAILED,
  STEPS_PARTIAL,
  STEPS_PENDING,
  STEPS_RUNNING,
} from '../scenes/fixtures';
import type { DraftScene } from '../scenes/types';
import type { DraftPhase, StepRow } from '../data/job';
import { DraftingView } from './drafting-view';

const noop = () => undefined;

function scene(
  name: string,
  phase: DraftPhase,
  steps: readonly StepRow[],
  cards = DAY_CARDS,
): DraftScene {
  return {
    name,
    render: () => (
      <DraftingView
        guide="pon"
        days={8}
        phase={phase}
        steps={steps}
        dayCards={cards}
        leaving={false}
        onDone={noop}
        onRetry={noop}
        onCancel={noop}
        onBack={noop}
      />
    ),
  };
}

export const DRAFTING_SCENES: readonly DraftScene[] = [
  scene('3c-8-drafting', { kind: 'running', slow: false }, STEPS_RUNNING),
  scene('drafting-starting', { kind: 'starting' }, STEPS_PENDING, []),
  scene('drafting-slow', { kind: 'running', slow: true }, STEPS_RUNNING),
  scene('drafting-partial', { kind: 'running', slow: false }, STEPS_PARTIAL),
  scene('drafting-failed', { kind: 'failed', step: STEPS_FAILED[3] ?? null }, STEPS_FAILED),
  scene('drafting-offline', { kind: 'offline' }, STEPS_PENDING, []),
  scene('drafting-stopped', { kind: 'cancelled' }, STEPS_RUNNING),
  scene(
    'drafting-no-dates',
    { kind: 'blocked', code: 'STATE_INVALID', reason: 'dates_not_locked' },
    STEPS_PENDING,
    [],
  ),
];
