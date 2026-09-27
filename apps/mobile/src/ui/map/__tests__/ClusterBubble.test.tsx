import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { ClusterBubble } from '../ClusterBubble';

describe('ClusterBubble', () => {
  it('shows the "+N" count and an expand-hint accessibility label', async () => {
    await renderWithI18n(<ClusterBubble count={9} />);
    expect(screen.getByText('+9')).toBeTruthy();
    expect(screen.getByLabelText('9 places here, tap to expand')).toBeTruthy();
  });

  it('calls onPress to expand', async () => {
    const onPress = jest.fn();
    await renderWithI18n(<ClusterBubble count={3} onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('cluster-bubble'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
