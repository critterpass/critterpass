/**
 * Where the system's shortcuts land in the app. Siri's "Switch crew" opens `critterpass://crew/<id>`
 * (the App Shortcuts compiled into the app): the crew becomes the one the app shows, and Home opens
 * on it. Anything that is not a crew id just opens Home.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, never copy. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CrewShortcutLanding {
  /** The crew to make active (`set_active_crew`), or null when the link names none. */
  readonly crewId: string | null;
  readonly href: string;
}

export function crewShortcutLanding(crewId: unknown): CrewShortcutLanding {
  if (typeof crewId !== 'string' || !UUID.test(crewId)) return { crewId: null, href: '/' };
  const id = crewId.toLowerCase();
  return { crewId: id, href: `/?crewId=${id}` };
}
