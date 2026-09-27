/**
 * The JS face of cp-deferred-link: each primitive only asks the native side on its own platform,
 * and a missing or failing native module means "no deferred link", never a crash on first launch.
 * The native module is a runtime-boundary double (docs/code-standards.md §17); names start with
 * "mock" because jest hoists the factory above these declarations.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';

const mockGetInstallReferrer = jest.fn<() => Promise<string | null>>();
const mockDetectLikelyLink = jest.fn<() => Promise<boolean>>();
const mockConsumeClipLink = jest.fn<() => Promise<string | null>>();

jest.mock('../src/CpDeferredLinkModule', () => ({
  nativeCpDeferredLinkModule: {
    getInstallReferrer: () => mockGetInstallReferrer(),
    detectLikelyLink: () => mockDetectLikelyLink(),
    consumeClipLink: () => mockConsumeClipLink(),
  },
}));

import { consumeClipLink, detectLikelyLink, getInstallReferrer } from '..';

function setPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  mockGetInstallReferrer.mockReset();
  mockDetectLikelyLink.mockReset();
  mockConsumeClipLink.mockReset();
});

describe('getInstallReferrer', () => {
  it('returns the Play referrer on Android', async () => {
    setPlatform('android');
    mockGetInstallReferrer.mockResolvedValue('cp_link=%2Fi%2FK7M2QX');
    await expect(getInstallReferrer()).resolves.toBe('cp_link=%2Fi%2FK7M2QX');
  });

  it('never asks on iOS and swallows native failures', async () => {
    setPlatform('ios');
    await expect(getInstallReferrer()).resolves.toBeNull();
    expect(mockGetInstallReferrer).not.toHaveBeenCalled();
    setPlatform('android');
    mockGetInstallReferrer.mockRejectedValue(new Error('service unavailable'));
    await expect(getInstallReferrer()).resolves.toBeNull();
  });
});

describe('detectLikelyLink', () => {
  it('reports a probable link on iOS only', async () => {
    setPlatform('ios');
    mockDetectLikelyLink.mockResolvedValue(true);
    await expect(detectLikelyLink()).resolves.toBe(true);
    setPlatform('android');
    await expect(detectLikelyLink()).resolves.toBe(false);
    expect(mockDetectLikelyLink).toHaveBeenCalledTimes(1);
  });
});

describe('consumeClipLink', () => {
  it('hands over the App Clip link on iOS only, and swallows native failures', async () => {
    setPlatform('ios');
    mockConsumeClipLink.mockResolvedValue('https://critterpass.app/i/K7M2QX');
    await expect(consumeClipLink()).resolves.toBe('https://critterpass.app/i/K7M2QX');
    mockConsumeClipLink.mockRejectedValue(new Error('no container'));
    await expect(consumeClipLink()).resolves.toBeNull();
    setPlatform('android');
    await expect(consumeClipLink()).resolves.toBeNull();
    expect(mockConsumeClipLink).toHaveBeenCalledTimes(2);
  });
});
