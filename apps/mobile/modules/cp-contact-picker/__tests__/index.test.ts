jest.mock('../src/CpContactPickerModule', () => ({
  nativeCpContactPickerModule: { pick: jest.fn() },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { isContactPickerAvailable, pickContact } from '../index';
import {
  nativeCpContactPickerModule,
  type NativePickedContact,
} from '../src/CpContactPickerModule';

/** The native picker is the boundary: the OS sheet itself cannot run under Jest. */
const { pick } = nativeCpContactPickerModule as unknown as {
  readonly pick: jest.Mock<() => Promise<NativePickedContact | null>>;
};

describe('cp-contact-picker', () => {
  it('is available when the native module is linked', () => {
    expect(isContactPickerAvailable()).toBe(true);
  });

  it('returns the picked name and number, trimmed', async () => {
    pick.mockResolvedValueOnce({ name: ' Kai ', phone: ' +65 9123 4567 ' });
    await expect(pickContact()).resolves.toEqual({ name: 'Kai', phone: '+65 9123 4567' });
  });

  it('reports a card without a number as a name alone', async () => {
    pick.mockResolvedValueOnce({ name: 'Kai' });
    await expect(pickContact()).resolves.toEqual({ name: 'Kai', phone: null });
    pick.mockResolvedValueOnce({ name: 'Kai', phone: '  ' });
    await expect(pickContact()).resolves.toEqual({ name: 'Kai', phone: null });
  });

  it('returns null when the user cancels', async () => {
    pick.mockResolvedValueOnce(null);
    await expect(pickContact()).resolves.toBeNull();
  });
});
