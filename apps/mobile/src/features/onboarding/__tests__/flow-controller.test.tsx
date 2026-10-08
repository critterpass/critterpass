/**
 * The flow controller: a relaunch resumes at the step the draft stopped at, finishing opens the
 * session gate and hands over a link that waited for the pass, and the pass reaches the server
 * through the real offline command queue (nothing listens on the test transport: offline).
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { render, renderHook, waitFor, act } from '@testing-library/react-native';

import type { PassDraft, PassDraftStep } from '@cp/domain';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { listQueuedCommands } from '@/data/status/use-queued-commands';
import { clearPendingLink, savePendingLink, setOnboardingComplete } from '@/lib/links/pending';

import { completeOnboarding, useOnboardingGate } from '../flow-controller/completion';
import {
  clearDraftForTests,
  forgetCachedDraftForTests,
  readDraft,
  readPassSync,
  updateDraft,
} from '../flow-controller/draft-store';
import { PassSync } from '../flow-controller/pass-sync';
import { resumeRoute, routeForStep } from '../flow-controller/steps';

const FILLED: Partial<PassDraft> = {
  given_name: 'Winston',
  avatar: { kind: 'critter', form_id: 'guide:tokek' },
  taste_done: true,
  home_iata: 'SIN',
  issued_at: '2026-09-26T08:00:00.000Z',
};

beforeEach(() => {
  clearDraftForTests();
  clearPendingLink();
  setOnboardingComplete(false);
});

describe('resume', () => {
  it('starts a new install at the splash', () => {
    expect(resumeRoute(readDraft())).toBe('/onboarding');
  });

  it.each(['name', 'photo', 'taste', 'home', 'issued', 'saved'] as PassDraftStep[])(
    'resumes at %s after the app is killed there',
    (step) => {
      updateDraft((d) => ({ ...d, ...FILLED, step }));
      forgetCachedDraftForTests();
      const draft = readDraft();
      expect(draft?.step).toBe(step);
      expect(resumeRoute(draft)).toBe(routeForStep(step));
    },
  );

  it('never resumes past a step whose answer is missing', () => {
    updateDraft((d) => ({ ...d, ...FILLED, avatar: null, step: 'home' }));
    forgetCachedDraftForTests();
    expect(resumeRoute(readDraft())).toBe('/onboarding/photo');
  });
});

describe('completion', () => {
  it('opens the session gate and goes Home', async () => {
    const { result } = await renderHook(() => useOnboardingGate());
    expect(result.current.status).toBe('onboarding');
    let href = '';
    await act(async () => {
      href = await completeOnboarding();
    });
    expect(href).toBe('/');
    expect(result.current.status).toBe('ready');
  });

  it('opens the link that waited for the pass instead of Home', async () => {
    savePendingLink({ link: '/i/K7M2QX', capturedAt: Date.now(), via: 'link' });
    const href = await completeOnboarding();
    expect(href).not.toBe('/');
    expect(href).toContain('K7M2QX');
  });
});

describe('pass sync', () => {
  let stack: TestLocalFirst | null = null;
  afterEach(async () => {
    await stack?.close();
    if (stack) removeDir(stack.dir);
    stack = null;
  });

  it('queues the issued pass once, offline, and keeps the placeholder number', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    updateDraft((d) => ({ ...d, ...FILLED, step: 'issued' }));
    const view = await render(<PassSync />, { wrapper: stack.wrapper });
    await waitFor(async () => {
      const queued = await listQueuedCommands(stack!.db);
      expect(queued.map((q) => q.cmd)).toEqual(['issue_pass']);
    });
    expect(readPassSync().issueQueued).toBe(true);
    // start_pass is online only: with no signal the number stays the placeholder.
    expect(readDraft()?.number).toBeNull();
    await view.rerender(<PassSync />);
    expect((await listQueuedCommands(stack.db)).length).toBe(1);
  });

  it('sends a refused start_pass once, not again on every edit of the name', async () => {
    const posted: string[] = [];
    stack = await openTestLocalFirst({
      holdUploads: true,
      transport: {
        postJson: (path) => {
          posted.push(path);
          return Promise.resolve({
            status: 422,
            body: { error: { code: 'VALIDATION', message: 'VALIDATION', retryable: false } },
          });
        },
      },
    });
    updateDraft((d) => ({ ...d, step: 'name' }));
    await render(<PassSync />, { wrapper: stack.wrapper });
    await waitFor(() => expect(posted).toEqual(['/v1/cmd/start_pass']));

    for (const name of ['W', 'Wi', 'Win', 'Wins', 'Winst']) {
      await act(async () => {
        updateDraft((d) => ({ ...d, given_name: name }));
        await Promise.resolve();
      });
    }

    expect(posted).toEqual(['/v1/cmd/start_pass']);
    expect(readDraft()?.number).toBeNull();
  });

  it('waits for the session before sending anything', async () => {
    updateDraft((d) => ({ ...d, ...FILLED, step: 'issued' }));
    await render(<PassSync />);
    expect(readPassSync().issueQueued).toBe(false);
  });
});
