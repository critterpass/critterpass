import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

// apps/mobile/src/lib may only import the `domain` package directly (tools/lint/boundaries.js);
// `@cp/i18n` is a leaf, script-agnostic package other layers (mobile-route, mobile-ui) already may
// import, so this reaches past that restriction the same way apps/mobile/src/lib/fonts's resolver
// does for `@cp/design-tokens` — only for the registry lookup, never for React/JSX.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { loadAllCatalogs, shippedLocaleCodes, sourceLocale } from '@cp/i18n';

import { pickDeviceLocale } from './device-locale.js';
import { persistedLocale } from './set-locale.js';

let initialActivation: Promise<void> | undefined;

/**
 * Activates the app's initial locale exactly once per app lifetime (persisted choice, else
 * device-preferred, else the source locale), caching the in-flight promise so every caller shares
 * one activation instead of racing to load catalogs twice.
 */
function ensureInitialLocale(): Promise<void> {
  if (i18n.locale) return Promise.resolve();
  initialActivation ??= (async () => {
    const locale = persistedLocale() ?? pickDeviceLocale(shippedLocaleCodes) ?? sourceLocale;
    const messages = await loadAllCatalogs(locale);
    i18n.loadAndActivate({ locale, messages });
  })();
  return initialActivation;
}

/**
 * True once the app's initial locale has finished activating. `apps/mobile/src/app/_layout.tsx`
 * gates hiding the splash screen on this alongside font readiness, the same way it already gates on
 * fonts, so the app never flashes an unlocalised or blank first frame.
 */
export function useI18nReady(): boolean {
  const [ready, setReady] = useState(() => Boolean(i18n.locale));

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    void ensureInitialLocale().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return ready;
}

export interface I18nRootProps {
  readonly children: ReactNode;
}

/**
 * Provides `i18n` to every `<Trans>`/`useLingui()` consumer via `@lingui/react`'s context, which
 * re-renders them on `setLocale` without remounting navigation — an in-place language switch. Mount
 * this only once `useI18nReady()` is true (see `_layout.tsx`); `I18nProvider` itself renders nothing
 * until a locale is active, so mounting earlier would render a blank frame instead of the splash
 * screen.
 */
export function I18nRoot({ children }: I18nRootProps): ReactNode {
  useEffect(() => {
    return i18n.on('missing', ({ locale, id }) => {
      // A shipped locale's normal "not translated yet" case never reaches here: `lingui compile`
      // bakes the English source text into every locale's compiled catalog for a message with no
      // translation, so `i18n._` already has a value for the id (verified by compiling a fixture
      // catalog and inspecting its output). This only fires for a genuinely missing id — a typo, or
      // a call site extraction never reached — which the design's "never a raw key" fallback (the
      // call site's own `message` default, kept in production by this app's babel config) still
      // covers, but is worth a breadcrumb. No crash-reporting SDK is installed yet (a later phase's
      // job), so this is a console warning until one is wired up.
      console.warn(`[i18n] missing message "${id}" for locale "${locale}"`);
    });
  }, []);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
