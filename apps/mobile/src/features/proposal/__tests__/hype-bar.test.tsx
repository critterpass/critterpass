// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderUi } from '@/ui/test-support/render';

import { HypeBar } from '../your-version/hype-bar';

describe('crew hype', () => {
  it('says how many of the crew are in, the organiser counted', async () => {
    await renderUi(
      <HypeBar hype={{ pct: 100, reacted: 0, boarded: 1, recipients: 1 }} latest={null} />,
    );
    expect(screen.getByText('2 of 2 in the crew are in.')).toBeTruthy();
    expect(screen.queryByText(/reacted/)).toBeNull();
    expect(screen.getByTestId('version-hype-bar')).toBeTruthy();
  });

  it('leaves the bar out while nobody has boarded or reacted', async () => {
    await renderUi(
      <HypeBar hype={{ pct: 0, reacted: 0, boarded: 0, recipients: 2 }} latest={null} />,
    );
    expect(screen.queryByTestId('version-hype-bar')).toBeNull();
    expect(screen.getByText('Nobody has answered yet.')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('counts the organiser, so a crew of two never reads "0 of 1"', async () => {
    await renderUi(
      <HypeBar
        hype={{ pct: 0, reacted: 0, boarded: 0, recipients: 1 }}
        latest={null}
        organiser="Linh"
      />,
    );
    expect(screen.getByText('Only Linh is in so far.')).toBeTruthy();
    await renderUi(
      <HypeBar
        hype={{ pct: 100, reacted: 0, boarded: 1, recipients: 1 }}
        latest={null}
        organiser="Linh"
      />,
    );
    expect(screen.getByText('2 of 2 in the crew are in.')).toBeTruthy();
  });

  it('adds the reactions when someone reacted', async () => {
    await renderUi(
      <HypeBar
        hype={{ pct: 67, reacted: 2, boarded: 1, recipients: 3 }}
        latest={{ name: 'Minh', kind: 'six_am' }}
      />,
    );
    expect(
      screen.getByText('Minh replied “6AM??”. 2 of 4 in the crew are in. 2 reacted.'),
    ).toBeTruthy();
  });
});
