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
// screen. `grow-into-page-detail` isn't listed: it's a sub-route `grow-into-page` navigates to
// itself.
export const DEV_SECTIONS: readonly DevScreenSection[] = [
  {
    title: 'Labs',
    entries: [
      { testId: 'dev-nav-accounts', href: '/(dev)/accounts', label: 'Test accounts (two people)' },
      { testId: 'dev-nav-start-fresh', href: '/(dev)/start-fresh', label: 'Start as a new user' },
      {
        testId: 'dev-nav-proposal-lab',
        href: '/(dev)/proposal-lab',
        label: 'Proposal (3f scenes)',
      },
      { testId: 'dev-nav-motion-lab', href: '/(dev)/motion-lab', label: 'Motion lab' },
      { testId: 'dev-nav-sticker-lab', href: '/(dev)/sticker-lab', label: 'Sticker lab' },
      { testId: 'dev-nav-gallery', href: '/(dev)/gallery', label: 'Component gallery' },
      { testId: 'dev-nav-money-lab', href: '/(dev)/money-lab', label: 'Money (3i scenes)' },
      { testId: 'dev-nav-type-lab', href: '/(dev)/type-lab', label: 'Type lab (label centring)' },
      { testId: 'dev-nav-guide-lab', href: '/(dev)/guide-lab', label: 'Guide (3j, 4b scenes)' },
      {
        testId: 'dev-nav-bookings-lab',
        href: '/(dev)/bookings-lab',
        label: 'Bookings (3h scenes)',
      },
      {
        testId: 'dev-nav-supplier-lab',
        href: '/(dev)/supplier-lab',
        label: 'Suppliers (3h-3, 6f-1 scenes)',
      },
      {
        testId: 'dev-nav-drivers-directory-lab',
        href: '/(dev)/drivers-directory-lab',
        label: "Crews' drivers (6e, 6g scenes)",
      },
      {
        testId: 'dev-nav-plan-edit-lab',
        href: '/(dev)/plan-edit-lab',
        label: 'Plan editing (7b-1 stop sheets, 3g-2 scenes)',
      },
      {
        testId: 'dev-nav-plan-views-lab',
        href: '/(dev)/plan-views-lab',
        label: 'Plan views (7a, 7b, export and chat card scenes)',
      },
      {
        testId: 'dev-nav-trip-day-lab',
        href: '/(dev)/trip-day-lab',
        label: 'Trip day (3k scenes)',
      },
      { testId: 'dev-nav-go-lab', href: '/(dev)/go-lab', label: 'GO (route preview scenes)' },
      {
        testId: 'dev-nav-disruption-lab',
        href: '/(dev)/disruption-lab',
        label: 'Disruptions (3k-5, 3k-7, 3k-8, 3k-9 scenes)',
      },
      {
        testId: 'dev-nav-critters-lab',
        href: '/(dev)/critters-lab',
        label: 'Critters (3l scenes)',
      },
      { testId: 'dev-nav-you-lab', href: '/(dev)/you-lab', label: 'You (3n scenes)' },
      { testId: 'dev-nav-help-lab', href: '/(dev)/help-lab', label: 'Help (3p scenes)' },
      { testId: 'dev-nav-recap-lab', href: '/(dev)/recap-lab', label: 'Recap (3m scenes)' },
      {
        testId: 'dev-nav-live-map',
        href: '/(dev)/live-map',
        label: 'Crew live map (3g-4 scenes)',
      },
      {
        testId: 'dev-nav-setup',
        href: '/(dev)/setup',
        label: 'Trip setup (3c-3…3c-10 scenes)',
      },
      {
        testId: 'dev-nav-draft',
        href: '/(dev)/draft',
        label: 'Drafting and redrafts (3c-8…3c-12, 4f-3 scenes)',
      },
      {
        testId: 'dev-nav-explore-lab',
        href: '/(dev)/explore-lab',
        label: 'Explore (7c, 7e, 7g, 3b-8 scenes)',
      },
      {
        testId: 'dev-nav-planning-map-lab',
        href: '/(dev)/planning-map-lab',
        label: 'Planning kit (7a, 7c map, sheet and components)',
      },
      {
        testId: 'dev-nav-plan-ideas-lab',
        href: '/(dev)/plan-ideas-lab',
        label: 'Plan ideas (7f-1, 7f-2, 7h-6, 7h-7 scenes)',
      },
      {
        testId: 'dev-nav-search-lab',
        href: '/(dev)/search-lab',
        label: 'Search (7d, 7i-2 scenes)',
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
        testId: 'dev-nav-spikes-app-group',
        href: '/(dev)/spikes/app-group',
        label: 'Spike: App group',
      },
      {
        testId: 'dev-nav-spikes-auth',
        href: '/(dev)/spikes/auth',
        label: 'Spike: Auth (anonymous upgrade)',
      },
      {
        testId: 'dev-nav-spikes-critter',
        href: '/(dev)/spikes/critter',
        label: 'Spike: Critter draw',
      },
      {
        testId: 'dev-nav-spikes-critterdex-grid',
        href: '/(dev)/spikes/critterdex-grid',
        label: 'Spike: Critterdex grid',
      },
      {
        testId: 'dev-nav-spikes-grow-into-page',
        href: '/(dev)/spikes/grow-into-page',
        label: 'Spike: Grow-into-page transitions',
      },
      {
        testId: 'dev-nav-spikes-live-activity',
        href: '/(dev)/spikes/live-activity',
        label: 'Spike: Live Activity',
      },
      {
        testId: 'dev-nav-spikes-location',
        href: '/(dev)/spikes/location',
        label: 'Spike: Location dwell',
      },
      {
        testId: 'dev-nav-spikes-map',
        href: '/(dev)/spikes/map',
        label: 'Spike: Map offline (PMTiles)',
      },
      {
        testId: 'dev-nav-spikes-timeline-drag',
        href: '/(dev)/spikes/timeline-drag',
        label: 'Spike: Timeline drag',
      },
    ],
  },
];
