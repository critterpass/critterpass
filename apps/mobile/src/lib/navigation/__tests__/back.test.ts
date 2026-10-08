/**
 * Back from a screen goes one screen back when there is one, and replaces the screen with the
 * fallback (Home unless the caller names its parent) when it was opened with nothing under it.
 */
jest.mock('expo-router', () => ({
  router: { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() },
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';

import { goBackOr } from '../back';

const mockRouter = jest.mocked(router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('goBackOr', () => {
  it('goes back one screen when there is one under this screen', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    goBackOr('/wallet');
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces the screen with the fallback when nothing is under it', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    goBackOr('/wallet');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/wallet');
  });

  it('falls back to Home when the caller names no parent', () => {
    mockRouter.canGoBack.mockReturnValue(false);
    goBackOr();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
