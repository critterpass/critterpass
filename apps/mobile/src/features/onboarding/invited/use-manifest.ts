/**
 * The crew manifest's working state, shared by the current and the premium page: the crew's
 * members as their rows sync (the newcomer's own card stands alone until then), the truthful copy
 * (a count, never a name), the one `invite_manifest_reached` event, and the two ways on.
 */
import { router } from 'expo-router';
import { useContext, useEffect, useRef, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useAnalytics } from '@/lib/analytics';

import { useInviteServices } from './invite-services';
import { useInviteSession } from './invite-session';
import { manifestCopy } from './manifest-copy';
import { watchCrewMembers, type MemberRow } from './manifest-query';
import { HANDOFF_ROUTES, tripPlanRoute } from './routes';

export interface ManifestMember {
  readonly userId: string;
  readonly name: string;
  readonly isNewcomer: boolean;
  readonly isOrganiser: boolean;
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/u)[0] ?? '?';
}

export function useManifest() {
  const analytics = useAnalytics();
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const session = useInviteSession();
  const joined = session.joined;
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly MemberRow[]>([]);
  const reported = useRef(false);

  useEffect(() => {
    void services.uid().then(setUid, () => undefined);
  }, [services]);
  useEffect(() => {
    if (localFirst === null || joined === null) return undefined;
    return watchCrewMembers(localFirst.db, joined.crew_id, setRows);
  }, [localFirst, joined]);
  useEffect(() => {
    if (joined === null || reported.current) return;
    reported.current = true;
    const openedAt = session.openedAt;
    if (openedAt !== null) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
      analytics.capture('invite_manifest_reached', {
        duration_ms: Math.max(0, services.now() - openedAt),
        waitlisted: joined.waitlisted,
      });
    }
  }, [joined, session.openedAt, analytics, services]);

  const preview = session.preview;
  const myName = firstName(
    preview?.invitee_first_name ?? rows.find((r) => r.user_id === uid)?.display_name ?? null,
  );
  const members: (ManifestMember & { readonly colour: string | null })[] = rows.map((row) => ({
    userId: row.user_id,
    name: firstName(row.display_name),
    isNewcomer: row.user_id === uid,
    isOrganiser: row.role === 'organiser',
    colour: row.colour ?? null,
  }));
  if (uid !== null && !members.some((m) => m.isNewcomer)) {
    members.push({ userId: uid, name: myName, isNewcomer: true, isOrganiser: false, colour: null });
  }
  const waiting = preview?.invited_waiting ?? 0;
  const copy = manifestCopy({
    name: myName,
    crew: preview?.crew_name ?? '',
    members: members.length,
    cap: preview?.seat_cap ?? null,
    waiting,
    waitlisted: joined?.waitlisted ?? false,
    position: joined?.waitlist_position ?? null,
  });

  const openCrew = () => {
    if (joined === null) return;
    router.replace({ pathname: HANDOFF_ROUTES.home, params: { crewId: joined.crew_id } });
  };
  const openPlan = () => {
    if (joined === null) return;
    if (joined.trip_id === null) openCrew();
    else router.replace(tripPlanRoute(joined.trip_id));
  };

  return {
    joined,
    preview,
    members,
    /** Named seats still waiting (a count only); none for a waitlisted joiner. */
    waiting: joined?.waitlisted === true ? 0 : waiting,
    copy,
    openCrew,
    openPlan,
    goHome: () => router.replace(HANDOFF_ROUTES.home),
  };
}
