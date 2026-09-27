import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

const mockWriteSnapshot = jest.fn();
const mockReloadWidgets = jest.fn();

jest.mock('../../../modules/cp-app-group', () => ({
  writeSnapshot: (...args: unknown[]) => mockWriteSnapshot(...args),
  reloadWidgets: (...args: unknown[]) => mockReloadWidgets(...args),
}));

import LiveActivitySpikeScreen from '../(dev)/spikes/live-activity';

describe('LiveActivitySpikeScreen', () => {
  it('seeds a LeaveBy content-state snapshot the widget target can read', async () => {
    const { getByText, findByText } = await render(<LiveActivitySpikeScreen />);

    await fireEvent.press(getByText('Seed leave-by preview snapshot'));

    expect(mockWriteSnapshot).toHaveBeenCalledTimes(1);
    const [key, json] = mockWriteSnapshot.mock.calls[0] as [string, string];
    expect(key).toBe('la-leave-by-preview');
    const envelope = JSON.parse(json) as { schema: number; content_state: { state: string } };
    expect(envelope.schema).toBe(1);
    expect(envelope.content_state.state).toBe('soon');
    expect(mockReloadWidgets).toHaveBeenCalledTimes(1);

    expect(await findByText(/Seeded la-leave-by-preview/)).toBeTruthy();
  });
});
