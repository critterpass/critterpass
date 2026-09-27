import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import DevToolsIndexScreen from '../(dev)/index';

describe('DevToolsIndexScreen', () => {
  it('lists every real (dev) screen for Maestro to tap into instead of using openLink', async () => {
    const { getByTestId } = await render(<DevToolsIndexScreen />);

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

  it('shows a build marker proving which JS bundle is running (embedded, absent an EAS Update)', async () => {
    const { getByTestId } = await render(<DevToolsIndexScreen />);

    expect(getByTestId('dev-build-marker')).toHaveTextContent('update:embedded');
  });
});
