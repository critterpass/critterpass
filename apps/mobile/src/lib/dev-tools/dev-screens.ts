import type { Href } from 'expo-router';

export interface DevScreenEntry {
  readonly testId: string;
  readonly href: Href;
  readonly label: string;
}

export interface DevScreenSection {
  readonly title: string;
  readonly entries: readonly DevScreenEntry[];
}

// Every real (dev) screen, listed once here for the Developer tools index rather than deep-linked
// to directly: Maestro's `openLink` into a (dev) route is non-deterministic on EAS-hosted
// simulators (upstream mobile-dev-inc/Maestro#2610, confirmed via a failure screenshot in an
// earlier pass of this flow), so `e2e/**` flows tap through this list instead. Grouped in the order
// a developer would scan them: the labs first (most-used), then the live checks, then every spike
// screen.
export const DEV_SECTIONS: readonly DevScreenSection[] = [
  {
    title: 'Labs',
    entries: [
      {
        testId: 'dev-nav-premium-shell',
        href: '/(dev)/premium-shell/legend',
        label: 'Premium shell (tabs, sheets, zoom, morph)',
      },
      { testId: 'dev-nav-accounts', href: '/(dev)/accounts', label: 'Test accounts (two people)' },
      { testId: 'dev-nav-start-fresh', href: '/(dev)/start-fresh', label: 'Start as a new user' },
      { testId: 'dev-nav-motion-lab', href: '/(dev)/motion-lab', label: 'Motion lab' },
      { testId: 'dev-nav-premium-kit', href: '/(dev)/premium-kit', label: 'Premium kit' },
      {
        testId: 'dev-nav-drivers-lab',
        href: '/(dev)/drivers-lab',
        label: 'Find a driver (6a–6f on this trip)',
      },
      {
        testId: 'dev-nav-supplier-lab',
        href: '/(dev)/supplier-lab',
        label: 'Suppliers (3h-3, 6f-1 scenes)',
      },
      {
        testId: 'dev-nav-crew-plans',
        href: '/community/da-lat',
        label: 'Crew plans for Đà Lạt (3o-1)',
      },
      {
        testId: 'dev-nav-shared-plan',
        href: '/community/plan/00000000-0000-7000-8000-000000000000',
        label: 'A shared plan that is gone (3o-2)',
      },
      {
        testId: 'dev-nav-rate-trip',
        href: '/community/rate/00000000-0000-7000-8000-000000000000',
        label: 'Rate the trip, no trip (3o-3)',
      },
      {
        testId: 'dev-nav-share-plan',
        href: '/community/publish/00000000-0000-7000-8000-000000000000',
        label: 'Share the plan, no trip (3o-4)',
      },
    ],
  },
  {
    title: 'Live checks',
    entries: [
      {
        testId: 'dev-nav-permissions',
        href: '/(dev)/permissions',
        label: 'Permissions (live status)',
      },
      {
        testId: 'dev-nav-location-engine',
        href: '/(dev)/location-engine',
        label: 'Location engine (trip day)',
      },
      {
        testId: 'dev-nav-permissions-primer',
        href: '/(dev)/permissions-primer',
        label: 'Permissions primer (3a-9)',
      },
      {
        testId: 'dev-nav-live-activities',
        href: '/(dev)/live-activities',
        label: 'Live Activities (5a-1, 5a-3, 5a-5)',
      },
    ],
  },
  {
    title: 'Spikes',
    entries: [
      {
        testId: 'dev-nav-spikes-auth',
        href: '/(dev)/spikes/auth',
        label: 'Spike: Auth (anonymous upgrade)',
      },
      {
        testId: 'dev-nav-spikes-map',
        href: '/(dev)/spikes/map',
        label: 'Spike: Map offline (PMTiles)',
      },
    ],
  },
];
