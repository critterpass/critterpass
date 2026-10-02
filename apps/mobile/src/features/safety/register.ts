/**
 * Help and SOS startup, imported once by the root layout: 3k-6 and 3k-10 join the navigation
 * registry (the guide button's long-press opens Help) and the takeover runtime is exported for
 * the session bridges.
 */
import { registerSafetyScreens } from './routes';

registerSafetyScreens();

export { SafetyRuntime } from './runtime';
