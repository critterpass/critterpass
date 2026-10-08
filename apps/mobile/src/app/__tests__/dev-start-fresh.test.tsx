const mockStartFresh =
  jest.fn<(options: { leaveAccountOnServer: boolean }) => Promise<Record<string, unknown>>>();
jest.mock('@/lib/dev-tools/start-fresh', () => ({
  startFresh: (_ports: unknown, options: { leaveAccountOnServer: boolean }) =>
    mockStartFresh(options),
}));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => undefined }),
  useFocusEffect: () => undefined,
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import DevStartFreshSheet from '../(dev)/start-fresh';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet() {
  return renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <DevStartFreshSheet />
      </ScreenJoltProvider>
    </SafeAreaProvider>,
  );
}

describe('DevStartFreshSheet', () => {
  beforeEach(() => {
    mockStartFresh.mockReset();
    mockBack.mockReset();
  });

  it('wipes nothing on opening: it says what will happen and waits for the confirm', async () => {
    const { getByTestId } = await renderSheet();
    expect(getByTestId('dev-start-fresh-confirm')).toHaveTextContent(/This phone forgets/u);
    expect(mockStartFresh).not.toHaveBeenCalled();
  });

  it('cancel closes the sheet without wiping', async () => {
    const { getByLabelText } = await renderSheet();
    await fireEvent.press(getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockStartFresh).not.toHaveBeenCalled();
  });

  it('asks again, saying the account stays, before wiping when the server cannot erase it', async () => {
    mockStartFresh.mockResolvedValueOnce({ kind: 'account_would_stay', why: 'unavailable' });
    const { getByLabelText, findByTestId } = await renderSheet();
    await fireEvent.press(getByLabelText('Start fresh'));
    expect(await findByTestId('dev-start-fresh-account-stays')).toHaveTextContent(
      /old account stays on the server/u,
    );
    // The first confirm never agreed to leave the account behind.
    expect(mockStartFresh.mock.calls).toEqual([[{ leaveAccountOnServer: false }]]);

    mockStartFresh.mockResolvedValueOnce({ kind: 'restarting' });
    await fireEvent.press(getByLabelText('Start fresh anyway'));
    expect(mockStartFresh.mock.calls[1]).toEqual([{ leaveAccountOnServer: true }]);
  });

  it('says why when the server refused, and wipes nothing more', async () => {
    mockStartFresh.mockResolvedValue({ kind: 'server_failed', message: 'FORBIDDEN (production)' });
    const { getByLabelText, findByTestId } = await renderSheet();
    await fireEvent.press(getByLabelText('Start fresh'));
    expect(await findByTestId('dev-start-fresh-failed')).toHaveTextContent(/FORBIDDEN/u);
    expect(mockStartFresh).toHaveBeenCalledTimes(1);
  });
});
