import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Alert, type AlertButton } from 'react-native';

import { askToDiscard, sheetLeaveDecision } from '../dirty-sheet';

const PROMPT = {
  title: 'Discard this booking?',
  message: 'What you typed goes.',
  discard: 'Discard',
  keep: 'Keep editing',
};

describe('sheetLeaveDecision', () => {
  it('lets a sheet without edits go at once', () => {
    expect(sheetLeaveDecision({ dirty: false, committing: false })).toBe('leave');
  });

  it('asks before a sheet with edits goes', () => {
    expect(sheetLeaveDecision({ dirty: true, committing: false })).toBe('ask');
  });

  it("does not ask when the sheet's own verb is keeping the edits", () => {
    expect(sheetLeaveDecision({ dirty: true, committing: true })).toBe('leave');
  });
});

describe('askToDiscard', () => {
  afterEach(() => jest.restoreAllMocks());

  /** The OS alert's boundary: presses the button with this label. */
  function choose(label: string | null) {
    return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons, options) => {
      if (label === null) {
        options?.onDismiss?.();
        return;
      }
      (buttons as AlertButton[]).find((button) => button.text === label)?.onPress?.();
    });
  }

  it('offers keep as the cancel choice and discard as the destructive one', async () => {
    const alert = choose('Keep editing');
    await askToDiscard(PROMPT);
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(buttons.map((button) => [button.text, button.style])).toEqual([
      ['Keep editing', 'cancel'],
      ['Discard', 'destructive'],
    ]);
  });

  it('discards only when Discard is pressed', async () => {
    choose('Discard');
    await expect(askToDiscard(PROMPT)).resolves.toBe(true);
    choose('Keep editing');
    await expect(askToDiscard(PROMPT)).resolves.toBe(false);
    choose(null);
    await expect(askToDiscard(PROMPT)).resolves.toBe(false);
  });
});
