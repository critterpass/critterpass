/**
 * Opens "Start as" (the (dev) route) when a device flow launched a cleared install with the
 * request in a launch argument: `cp_install_referrer` set to `cp_start_as=<scenario>` and
 * optionally `&cp_lang=<en|vi>`. Maestro's `launchApp.arguments` puts it on the launch intent as a
 * string extra on Android, read by the cp-deferred-link module (the one launch extra the native
 * side reads; the first-launch link check ignores a referrer without a link), and in the argument
 * domain of the user defaults on iOS, read through React Native's `Settings`.
 *
 * Mounted by `DevToolsShake`, so it never runs in production, and it only acts while this install
 * has not completed onboarding: a relaunch or an in-app restart with the same arguments does
 * nothing. The route it opens is not in a production bundle at all.
 */
import { requireOptionalNativeModule } from 'expo';
import { router, useNavigationContainerRef, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Settings } from 'react-native';

import { isOnboardingComplete } from '../links/pending';

export const START_AS_ARGUMENT = 'cp_install_referrer';
export const START_AS_ROUTE = '/(dev)/start-as';
const ONBOARDING_GROUP = 'onboarding';
/** A launch that has not settled on the splash by then opens "Start as" from wherever it is. */
const SETTLE_DEADLINE_MS = 8000;
const RETRY_MS = 250;

export interface StartAsLaunchRequest {
  readonly scenario: string;
  readonly lang: string | null;
}

/** The request in a launch argument's value, or null when it carries none. */
export function parseStartAsArgument(value: unknown): StartAsLaunchRequest | null {
  if (typeof value !== 'string') return null;
  const params = new URLSearchParams(value);
  const scenario = (params.get('cp_start_as') ?? '').trim();
  if (scenario === '') return null;
  const lang = (params.get('cp_lang') ?? '').trim();
  return { scenario, lang: lang === '' ? null : lang };
}

/** The native module's one call this file needs; bound by name because `lib` imports no module. */
interface LaunchExtraModule {
  getReferrerOverride(): Promise<string | null>;
}

async function readLaunchArgument(): Promise<unknown> {
  try {
    if (Platform.OS === 'ios') return Settings.get(START_AS_ARGUMENT) as unknown;
    const native = requireOptionalNativeModule<LaunchExtraModule>('CpDeferredLink');
    return native === null ? null : await native.getReferrerOverride();
  } catch {
    return null;
  }
}

export interface StartAsLaunchProps {
  /** Reads the launch argument; defaults to the platform's own. */
  readonly read?: () => Promise<unknown>;
}

export function StartAsLaunch({ read = readLaunchArgument }: StartAsLaunchProps) {
  const navigation = useNavigationContainerRef();
  const segments: readonly string[] = useSegments();
  const [request, setRequest] = useState<StartAsLaunchRequest | null>(null);
  const [tick, setTick] = useState(0);
  const askedAt = useRef(0);
  const opened = useRef(false);

  useEffect(() => {
    if (isOnboardingComplete()) return undefined;
    let live = true;
    void read().then((value) => {
      const parsed = parseStartAsArgument(value);
      if (!live || parsed === null) return;
      askedAt.current = Date.now();
      setRequest(parsed);
    });
    return () => {
      live = false;
    };
  }, [read]);

  useEffect(() => {
    if (request === null || opened.current) return undefined;
    // The session gate sends a new install to the splash; opening before that lands would be
    // undone by it.
    const settled =
      segments[0] === ONBOARDING_GROUP || Date.now() - askedAt.current > SETTLE_DEADLINE_MS;
    if (!navigation.isReady() || !settled) {
      const retry = setTimeout(() => setTick((count) => count + 1), RETRY_MS);
      return () => clearTimeout(retry);
    }
    opened.current = true;
    router.replace({
      pathname: START_AS_ROUTE,
      params: {
        scenario: request.scenario,
        ...(request.lang === null ? {} : { lang: request.lang }),
      },
    });
    return undefined;
  }, [request, segments, navigation, tick]);

  return null;
}
