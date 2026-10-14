import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithI18n } from '../../../lib/i18n/testing';

import { Composer } from '../controls/Composer';

function Draft({ onMic, onSend }: { onMic: () => void; onSend: () => void }) {
  const [draft, setDraft] = useState('');
  return (
    <Composer
      value={draft}
      onChangeText={setDraft}
      placeholder="Ask Tokek"
      accessibilityLabel="Ask Tokek"
      onSend={onSend}
      canSend={draft.trim() !== ''}
      sendLabel="Send"
      idle={{ icon: 'mic', label: 'Talk to Tokek', onPress: onMic, testID: 'mic' }}
      testID="field"
    />
  );
}

describe('composer', () => {
  it('shows the idle action while empty and send once there is text', async () => {
    const onMic = jest.fn();
    const onSend = jest.fn();
    await renderWithI18n(<Draft onMic={onMic} onSend={onSend} />);
    expect(screen.queryByLabelText('Send')).toBeNull();
    await fireEvent.press(screen.getByTestId('mic'));
    expect(onMic).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(screen.getByTestId('field'), 'rain tomorrow?');
    expect(screen.queryByTestId('mic')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('draws the placeholder clear of the caret only while the field is empty', async () => {
    await renderWithI18n(<Draft onMic={jest.fn()} onSend={jest.fn()} />);
    const field = screen.getByTestId('field');
    expect(field.props.placeholder).toBeUndefined();
    expect(field.props.accessibilityHint).toBe('Ask Tokek');
    expect(screen.getByText('Ask Tokek', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.changeText(field, 'hi');
    expect(screen.queryByText('Ask Tokek', { includeHiddenElements: true })).toBeNull();
  });
});
