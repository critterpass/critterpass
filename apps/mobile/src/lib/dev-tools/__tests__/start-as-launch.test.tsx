/**
 * The launch argument that opens "Start as": read once on an install that has not onboarded,
 * opened only after the launch settled on the splash, and ignored on an install with an account.
 */
const mockReplace = jest.fn();
const mockSegments: { current: string[] } = { current: [] };
jest.mock('expo-router', () => ({
  router: { replace: (href: unknown) => mockReplace(href) },
  useNavigationContainerRef: () => ({ isReady: () => true }),
  useSegments: () => mockSegments.current,
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';

import { setOnboardingComplete } from '../../links/pending';
import { parseStartAsArgument, StartAsLaunch } from '../start-as-launch';

beforeEach(() => {
  mockReplace.mockClear();
  mockSegments.current = [];
  setOnboardingComplete(false);
});

const settle = () => act(async () => void (await new Promise((done) => setTimeout(done, 400))));

describe('parseStartAsArgument', () => {
  it('reads the scenario and language a flow put in the launch argument', () => {
    expect(parseStartAsArgument('cp_start_as=trip_today&cp_lang=vi')).toEqual({
      scenario: 'trip_today',
      lang: 'vi',
    });
    expect(parseStartAsArgument('cp_start_as=inbox')).toEqual({ scenario: 'inbox', lang: null });
  });

  it('finds no request in a real install referrer, an empty one or a missing argument', () => {
    expect(parseStartAsArgument('utm_source=critterpass&cp_link=%2Fi%2FK7M2QX')).toBeNull();
    expect(parseStartAsArgument('cp_start_as=')).toBeNull();
    expect(parseStartAsArgument(null)).toBeNull();
    expect(parseStartAsArgument(undefined)).toBeNull();
  });
});

describe('StartAsLaunch', () => {
  it('opens the start-as screen once the launch has settled on the splash', async () => {
    const read = () => Promise.resolve('cp_start_as=everyday&cp_lang=vi');
    const view = await render(<StartAsLaunch read={read} />);
    await settle();
    // Still on the way to the splash: opening now would be undone by the session gate.
    expect(mockReplace).not.toHaveBeenCalled();

    mockSegments.current = ['onboarding'];
    await view.rerender(<StartAsLaunch read={read} />);
    await settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(dev)/start-as',
      params: { scenario: 'everyday', lang: 'vi' },
    });

    await view.rerender(<StartAsLaunch read={read} />);
    await settle();
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a request, and never reads on an install that has an account', async () => {
    mockSegments.current = ['onboarding'];
    await render(<StartAsLaunch read={() => Promise.resolve(null)} />);
    await settle();
    expect(mockReplace).not.toHaveBeenCalled();

    setOnboardingComplete(true);
    const read = jest.fn(() => Promise.resolve('cp_start_as=everyday'));
    await render(<StartAsLaunch read={read} />);
    await settle();
    expect(read).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
