import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { SET_ACTIVE_CREW } from '@/features/crew/crews-sheet/crew-commands';
import { crewShortcutLanding } from '@/features/home/widget-gallery/shortcut-routes';

/**
 * `critterpass://crew/<id>`, Siri's "Switch crew": makes that crew the one the app shows (queued
 * like a pick in the crews sheet) and opens Home on it. Nothing is drawn here.
 */
export default function SwitchCrewRoute() {
  const params = useLocalSearchParams<{ crewId?: string }>();
  const localFirst = useContext(LocalFirstContext);
  const landing = crewShortcutLanding(params.crewId);
  useEffect(() => {
    if (landing.crewId !== null && localFirst !== null) {
      void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: landing.crewId });
    }
    router.replace(landing.href);
    // One hand-off per link: the session and the id are what they were when the link opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing.href]);
  return null;
}
