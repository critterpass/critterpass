/**
 * The root's launch host draws nothing and tells the screens that wait for it when the native
 * launch screen has gone.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderUi } from '@/lib/test-support/render-ui';

import { LaunchHatch } from '../LaunchHatch';
import { resetLaunchStateForTests, useSplashRevealed } from '../launch-state';

beforeEach(() => {
  resetLaunchStateForTests();
});

function Waiting() {
  return <Text>{useSplashRevealed() ? 'revealed' : 'covered'}</Text>;
}

describe('the launch host', () => {
  it('tells waiting screens the launch screen went, and draws nothing', async () => {
    const view = await renderUi(
      <>
        <Waiting />
        <LaunchHatch revealed={false} />
      </>,
    );
    expect(screen.getByText('covered')).toBeTruthy();
    await view.rerender(
      <>
        <Waiting />
        <LaunchHatch revealed />
      </>,
    );
    expect(screen.getByText('revealed')).toBeTruthy();
    expect(screen.queryByTestId('launch-hatch-beat', { includeHiddenElements: true })).toBeNull();
  });
});
