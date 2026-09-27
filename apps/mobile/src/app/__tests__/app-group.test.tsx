import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

// The real module resolves to a native binding that only exists on-device/simulator; Jest runs on
// Node, so the native boundary is the test double here (code-standards.md §17), not the screen's
// own logic. Names must start with "mock" — jest hoists the factory above these declarations.
const mockWriteSnapshot = jest.fn();
const mockReloadWidgets = jest.fn();
const mockReadOutboxActions = jest.fn(() => []);

jest.mock('../../../modules/cp-app-group', () => ({
  writeSnapshot: (...args: unknown[]) => mockWriteSnapshot(...args),
  reloadWidgets: (...args: unknown[]) => mockReloadWidgets(...args),
  readOutboxActions: () => mockReadOutboxActions(),
}));

import AppGroupSpikeScreen from '../(dev)/spikes/app-group';

// The first render loads and transforms the whole screen's module graph; on a cold CI runner that
// alone takes longer than Jest's 5 s default.
jest.setTimeout(30_000);

describe('AppGroupSpikeScreen', () => {
  it('writes a schema-versioned hello snapshot and reports the round-trip time', async () => {
    const { getByText, findByText } = await render(<AppGroupSpikeScreen />);

    await fireEvent.press(getByText('Write hello snapshot'));

    expect(mockWriteSnapshot).toHaveBeenCalledTimes(1);
    const [key, json] = mockWriteSnapshot.mock.calls[0] as [string, string];
    expect(key).toBe('hello');
    const envelope = JSON.parse(json) as { schema: number; generated_at: string; message: string };
    expect(envelope.schema).toBe(1);
    expect(envelope.message).toContain('hello from JS');

    expect(await findByText(/ms$/)).toBeTruthy();
  });

  it('reloads widgets on demand', async () => {
    const { getByText } = await render(<AppGroupSpikeScreen />);
    await fireEvent.press(getByText('Reload widgets'));
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);
  });

  it('surfaces a native error instead of crashing the screen', async () => {
    mockWriteSnapshot.mockImplementationOnce(() => {
      throw new Error('App Group container is unavailable');
    });
    const { getByText, findByText } = await render(<AppGroupSpikeScreen />);

    await fireEvent.press(getByText('Write hello snapshot'));

    expect(await findByText('App Group container is unavailable')).toBeTruthy();
  });
});
