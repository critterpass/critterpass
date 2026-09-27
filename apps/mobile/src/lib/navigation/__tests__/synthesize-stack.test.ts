import { afterEach, describe, expect, it } from '@jest/globals';

import { decideGate } from '../gates';
import { PARENTS } from '../parents';
import { hrefFor, isScreenRegistered, registerScreens } from '../screen-registry';
import { HOME_SCREEN, parentChain, synthesizeStack } from '../synthesize-stack';

const unregisters: (() => void)[] = [];
function register(entries: Parameters<typeof registerScreens>[0]) {
  unregisters.push(registerScreens(entries));
}

afterEach(() => {
  unregisters.splice(0).forEach((unregister) => unregister());
});

describe('parentChain (prototype PARENT map)', () => {
  it('walks the planning flow from the draft back to Home', () => {
    expect(parentChain('3c-9')).toEqual(['3b-2', '3c-2', '3c-3', '3c-5', '3c-6', '3c-7', '3c-9']);
  });

  it('walks crew SOS back through the map and chat to Home', () => {
    expect(parentChain('3k-10')).toEqual(['3b-2', '3g-1', '3g-4', '3k-10']);
  });

  it('returns recap slides to the recap cover story', () => {
    expect(parentChain('3m-3')).toEqual(['3m-1', '3m-3']);
  });

  it('returns the paywall straight to Home', () => {
    expect(parentChain('4e-1')).toEqual([HOME_SCREEN, '4e-1']);
  });

  it('stops at a screen without a parent and survives cycles', () => {
    expect(parentChain('9z-1')).toEqual(['9z-1']);
    expect(parentChain('a', { a: 'b', b: 'a' })).toEqual(['b', 'a']);
  });

  it('is generated from the prototype, one entry per designed child screen', () => {
    expect(Object.keys(PARENTS).length).toBeGreaterThan(100);
    expect(PARENTS['3i-6']).toBe('3i-1');
  });
});

describe('synthesizeStack', () => {
  it('builds hrefs root first and skips screens no area has registered', () => {
    register({ '3b-2': '/', '3c-5': '/plan/budget', '3c-9': '/plan/draft' });
    expect(synthesizeStack('3c-9')).toEqual(['/', '/plan/budget', '/plan/draft']);
  });

  it('passes params to every href builder', () => {
    register({
      '3b-2': '/',
      '3g-1': ({ crewId = '' }) => ({ pathname: '/crew/[crewId]', params: { crewId } }),
      '3g-4': ({ crewId = '' }) => ({ pathname: '/crew/[crewId]/map', params: { crewId } }),
    });
    expect(synthesizeStack('3g-4', { crewId: 'bali-six' })).toEqual([
      '/',
      { pathname: '/crew/[crewId]', params: { crewId: 'bali-six' } },
      { pathname: '/crew/[crewId]/map', params: { crewId: 'bali-six' } },
    ]);
  });
});

describe('screen registry', () => {
  it('registers, replaces and unregisters screens', () => {
    expect(hrefFor('4e-1')).toBeUndefined();
    const first = registerScreens({ '4e-1': '/paywall' });
    expect(isScreenRegistered('4e-1')).toBe(true);
    const second = registerScreens({ '4e-1': '/paywall-v2' });
    expect(hrefFor('4e-1')).toBe('/paywall-v2');
    first();
    expect(hrefFor('4e-1')).toBe('/paywall-v2');
    second();
    expect(hrefFor('4e-1')).toBeUndefined();
  });
});

describe('session gate', () => {
  it('waits, redirects to onboarding once registered, or lets the session through', () => {
    expect(decideGate({ status: 'loading' }, '/welcome')).toEqual({ kind: 'wait' });
    expect(decideGate({ status: 'signedOut' }, '/welcome')).toEqual({
      kind: 'redirect',
      href: '/welcome',
    });
    expect(decideGate({ status: 'onboarding' }, undefined)).toEqual({ kind: 'allow' });
    expect(decideGate({ status: 'ready' }, '/welcome')).toEqual({ kind: 'allow' });
  });
});
