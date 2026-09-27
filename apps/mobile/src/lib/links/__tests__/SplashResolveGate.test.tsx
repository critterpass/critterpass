import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { resetDeferredLinkCheckForTests, type DeferredPrimitives } from '../deferred';
import { clearPendingLink, setOnboardingComplete } from '../pending';
import { createLinkResolverClient } from '../resolver-client';
import { SplashResolveGate } from '../SplashResolveGate';
import { fakeLinksHttp, standardRoutes } from '../test-support/fake-links-http';

const DEVICE = {
  id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09',
  platform: 'ios' as const,
  app_version: '1',
  tz: 'UTC',
};

function mount(prims: DeferredPrimitives, navigate: (href: string) => void) {
  const deps = {
    primitives: prims,
    client: createLinkResolverClient(fakeLinksHttp(standardRoutes).http),
    device: DEVICE,
  };
  return render(
    <SplashResolveGate
      deps={deps}
      navigate={navigate}
      renderResolving={() => <Text>resolving</Text>}
      renderPasteOffer={({ onPasted, onSkip }) => (
        <>
          <Pressable onPress={() => onPasted('https://critterpass.app/i/BAX6XD')}>
            <Text>paste</Text>
          </Pressable>
          <Pressable onPress={onSkip}>
            <Text>skip</Text>
          </Pressable>
        </>
      )}
    >
      <Text>splash</Text>
    </SplashResolveGate>,
  );
}

beforeEach(() => {
  resetDeferredLinkCheckForTests();
  clearPendingLink();
  setOnboardingComplete(false);
});

describe('SplashResolveGate', () => {
  it('shows the resolving state, then the normal splash when there is no link', async () => {
    const navigate = jest.fn<(href: string) => void>();
    await mount(
      {
        platform: 'android',
        getInstallReferrer: () => Promise.resolve(null),
        detectLikelyLink: () => Promise.resolve(false),
      },
      navigate,
    );
    expect(await screen.findByText('splash')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers the paste control on iOS and navigates to the pasted invite', async () => {
    const navigate = jest.fn<(href: string) => void>();
    await mount(
      {
        platform: 'ios',
        getInstallReferrer: () => Promise.resolve(null),
        detectLikelyLink: () => Promise.resolve(true),
      },
      navigate,
    );
    await fireEvent.press(await screen.findByText('paste'));
    expect(await screen.findByText('splash')).toBeTruthy();
    expect(navigate).toHaveBeenCalledWith(
      '/onboarding/invite/ticket?code=BAX6XD&kind=invite&via=paste',
    );
  });
});
