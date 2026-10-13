import { describe, expect, it } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalyticsProvider, type AnalyticsClient } from '@/lib/analytics';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/lib/test-support/render-ui';

import DevToolsIndexScreen from '../(dev)/index';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** PostHog is the network boundary: no flag is on and nothing is sent. */
const analytics = new Proxy(
  { posthog: { getFeatureFlag: () => undefined, onFeatureFlags: () => () => undefined } },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined) },
) as unknown as AnalyticsClient;

function renderScreen() {
  return renderUi(
    <AnalyticsProvider client={analytics}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ScreenJoltProvider>
          <DevToolsIndexScreen />
        </ScreenJoltProvider>
      </SafeAreaProvider>
    </AnalyticsProvider>,
  );
}

describe('DevToolsIndexScreen', () => {
  it('lists every real (dev) screen for Maestro to tap into instead of using openLink', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('dev-nav-motion-lab')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-auth')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-map')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-app-group')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-critter')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-critterdex-grid')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-grow-into-page')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-live-activity')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-location')).toBeTruthy();
    expect(getByTestId('dev-nav-spikes-timeline-drag')).toBeTruthy();
  });

  it('offers the staging demo data seed for each inbox scenario', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('dev-seed-demo')).toHaveTextContent('Seed demo data');
    expect(getByTestId('dev-seed-demo-inbox')).toBeTruthy();
    expect(getByTestId('dev-seed-demo-caught-up')).toBeTruthy();
    expect(getByTestId('dev-seed-demo-vote')).toBeTruthy();
    expect(getByTestId('dev-seed-demo-vote-final')).toBeTruthy();
  });

  it('shows a build marker proving which JS bundle is running (embedded, absent an EAS Update)', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('dev-build-marker')).toHaveTextContent('update:embedded');
  });
});
