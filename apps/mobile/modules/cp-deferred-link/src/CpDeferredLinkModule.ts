import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * The native binding (Kotlin Install Referrer / Swift pasteboard pattern check). Resolves to `null`
 * where the module isn't linked (Jest, a build without it); the JS API treats that as "nothing to
 * find".
 */
export declare class NativeCpDeferredLinkModule extends NativeModule {
  /** Android: the Play install referrer on the first call after install, then always null. */
  getInstallReferrer(): Promise<string | null>;
  /** iOS: true when the pasteboard probably holds a web URL (no alert, value not read). */
  detectLikelyLink(): Promise<boolean>;
  /** Android: a referrer passed as the `cp_install_referrer` launch extra by a test run. */
  getReferrerOverride(): Promise<string | null>;
}

export const nativeCpDeferredLinkModule =
  requireOptionalNativeModule<NativeCpDeferredLinkModule>('CpDeferredLink');
