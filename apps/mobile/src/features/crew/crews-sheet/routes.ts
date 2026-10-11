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

export function crewEditRoute(crewId: string): string {
  return `/crew/${crewId}/edit`;
}

export function crewLeaveRoute(crewId: string): string {
  return `/crew/${crewId}/leave`;
}

export function crewMemberRoute(crewId: string, uid: string): string {
  return `/crew/${crewId}/member/${uid}`;
}

export const CREW_SCREENS: Readonly<Record<string, string>> = {
  '3g-3': CREW_ROUTES.sheet,
};
