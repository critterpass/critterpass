/**
 * The guide's welcome line for the manifest: the api's line when it arrives while the crew cards
 * stamp in, otherwise the scripted line. It settles once, so a late answer never retypes a line
 * that has already started.
 */
import { useEffect, useState } from 'react';

import { useInviteServices } from './invite-services';

/** About as long as the first cards take to stamp in. */
export const WELCOME_WAIT_MS = 1500;

export function useWelcomeLine(
  joined: { readonly crew_id: string; readonly trip_id: string | null } | null,
  scripted: string,
): string {
  const services = useInviteServices();
  const [settled, setSettled] = useState<{ line: string | null } | null>(null);
  const crewId = joined?.crew_id ?? null;
  const tripId = joined?.trip_id ?? null;

  useEffect(() => {
    if (crewId === null) return undefined;
    let open = true;
    const settle = (line: string | null) => {
      if (!open) return;
      open = false;
      setSettled({ line });
    };
    const timer = setTimeout(() => settle(null), WELCOME_WAIT_MS);
    void services.welcome(crewId, tripId).then(
      (answer) => settle(answer?.line ?? null),
      () => settle(null),
    );
    return () => {
      open = false;
      clearTimeout(timer);
    };
  }, [crewId, tripId, services]);

  if (settled === null) return '';
  return settled.line ?? scripted;
}
