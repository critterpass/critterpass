/**
 * The root's deferred link gate on a first launch: the Play referrer's link is claimed (the api
 * answers from recorded fixtures) and opened, the splash is released exactly once, a returning
 * launch releases it straight away, and production never takes a test referrer override.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';

import { renderWithI18n } from '@/lib/i18n/testing';
import { resetDeferredLinkCheckForTests } from '@/lib/links/deferred';
import { clearPendingLink, setOnboardingComplete } from '@/lib/links/pending';
import { createLinkResolverClient } from '@/lib/links/resolver-client';
import { fakeLinksHttp, standardRoutes } from '@/lib/links/test-support/fake-links-http';

import {
  DeferredLinkGate,
  deferredLinkPrimitives,
  type DeferredLinkNative,
} from '../DeferredLinkGate';

const DEVICE = {
  id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09',
  platform: 'android' as const,
  app_version: '1',
  tz: 'UTC',
};

function native(referrer: string | null, override: string | null = null): DeferredLinkNative {
  return {
    getInstallReferrer: () => Promise.resolve(referrer),
    detectLikelyLink: () => Promise.resolve(false),
    getReferrerOverride: () => Promise.resolve(override),
  };
}

async function mount(primitives: ReturnType<typeof deferredLinkPrimitives>) {
  const links = fakeLinksHttp(standardRoutes);
  const navigate = jest.fn<(href: string) => void>();
  const onReady = jest.fn<() => void>();
  const view = await renderWithI18n(
    <DeferredLinkGate
      primitives={primitives}
      navigate={navigate}
      onReady={onReady}
      claims={{
        client: createLinkResolverClient(links.http),
        device: () => Promise.resolve(DEVICE),
      }}
    />,
  );
  return {
    navigate,
    onReady,
    requests: links.requests,
    unmount: async () => {
      await view.unmount();
    },
  };
}

beforeEach(() => {
  resetDeferredLinkCheckForTests();
  clearPendingLink();
  setOnboardingComplete(false);
});

describe('DeferredLinkGate', () => {
  it("opens the install referrer's link on first launch, then releases the splash", async () => {
    const referrer = `cp_link=${encodeURIComponent('/i/BAX6XD')}`;
    const { navigate, onReady, requests } = await mount(
      deferredLinkPrimitives(native(referrer), 'android', 'staging'),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(requests.map((request) => request.path)).toEqual(['/v1/links/claim']);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toMatch(/^\/onboarding\/invite\/ticket\?code=BAX6XD/);
  });

  it('releases the splash straight away on a later launch', async () => {
    const first = await mount(deferredLinkPrimitives(native(null), 'android', 'staging'));
    await waitFor(() => expect(first.onReady).toHaveBeenCalledTimes(1));
    await first.unmount();

    const { navigate, onReady, requests } = await mount(
      deferredLinkPrimitives(native(`cp_link=${encodeURIComponent('/i/BAX6XD')}`), 'android', 'x'),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('never offers the test referrer override to a production build', () => {
    const override = native(null, `cp_link=${encodeURIComponent('/i/BAX6XD')}`);
    expect('getReferrerOverride' in deferredLinkPrimitives(override, 'android', 'production')).toBe(
      false,
    );
    expect(
      'getReferrerOverride' in deferredLinkPrimitives(override, 'android', 'development'),
    ).toBe(true);
    expect(deferredLinkPrimitives(override, 'ios', 'production').platform).toBe('ios');
  });
});
