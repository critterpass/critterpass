// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import DevToolsIndexScreen from '../(dev)/index';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <DevToolsIndexScreen />
      </ScreenJoltProvider>
    </SafeAreaProvider>,
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
