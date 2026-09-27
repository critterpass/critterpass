import { expoClient } from '@better-auth/expo/client';
import { anonymousClient, phoneNumberClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

// Real deployed spike-auth service (T3, tools/spikes/src/s-auth/deploy-main.ts on Railway
// staging) — kept running for the founder device run; see the ADR for its current status.
const SPIKE_AUTH_BASE_URL = 'https://spike-auth-staging.up.railway.app';

export const authClient = createAuthClient({
  baseURL: SPIKE_AUTH_BASE_URL,
  plugins: [
    // `disableCache: true`: the expo client otherwise serves a cached session response keyed by
    // the (unchanged) session cookie, which papers over `isAnonymous`/`phoneNumber` flipping
    // server-side after phone verify or a social upgrade — a real repro found in this pass (see
    // the ADR), not a hypothetical.
    expoClient({ scheme: 'critterpass-dev', storage: SecureStore, disableCache: true }),
    anonymousClient(),
    phoneNumberClient(),
  ],
});

// Not a screen, only a client helper next to routes (see dwell-ring.ts's header for why this
// needs a default export at all: expo-router's file-based routing scans every file here).
export default {};
