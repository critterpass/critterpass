/** The crew area's routes, and the design screen ids the navigation registry knows them by. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
export const CREW_ROUTES = {
  sheet: '/crew',
  newCrew: '/crew/new',
  inviteFriends: '/crew/invite-friends',
  joinCode: '/onboarding/invite/code',
  savePass: '/onboarding/save',
  home: '/',
} as const;

export function crewSettingsRoute(crewId: string): string {
  return `/crew/${crewId}/settings`;
}

export function crewInviteRoute(crewId: string): string {
  return `/crew/${crewId}/invite`;
}

export const CREW_SCREENS: Readonly<Record<string, string>> = {
  '3g-3': CREW_ROUTES.sheet,
};
