jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  hasAction: jest.fn(),
  requestReview: jest.fn(),
  storeUrl: jest.fn(),
}));

import { describe, expect, it, jest } from '@jest/globals';
import * as StoreReview from 'expo-store-review';

import { requestStoreReview } from '../index';

/** The store sheet is the boundary: it cannot run under Jest. */
const store = StoreReview as unknown as {
  readonly isAvailableAsync: jest.Mock<() => Promise<boolean>>;
  readonly hasAction: jest.Mock<() => Promise<boolean>>;
  readonly requestReview: jest.Mock<() => Promise<void>>;
};

describe('store review', () => {
  it('never asks where the store prompt is not available', async () => {
    store.isAvailableAsync.mockResolvedValue(false);
    store.hasAction.mockResolvedValue(true);
    await expect(requestStoreReview()).resolves.toBe(false);
    expect(store.requestReview).not.toHaveBeenCalled();
  });

  it('asks once when it can, and a store failure never reaches the caller', async () => {
    store.isAvailableAsync.mockResolvedValue(true);
    store.hasAction.mockResolvedValue(true);
    store.requestReview.mockResolvedValueOnce(undefined);
    await expect(requestStoreReview()).resolves.toBe(true);
    store.requestReview.mockRejectedValueOnce(new Error('store'));
    await expect(requestStoreReview()).resolves.toBe(false);
  });
});
