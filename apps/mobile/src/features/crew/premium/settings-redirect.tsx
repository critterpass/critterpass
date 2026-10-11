/**
 * The current UI has no page for the premium-only crew routes (edit, leave, a member): they open
 * the crew's settings instead, where those actions live.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { crewSettingsRoute } from '../crews-sheet/routes';

export function CrewSettingsRedirect() {
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  return <Redirect href={crewSettingsRoute(crewId)} />;
}
