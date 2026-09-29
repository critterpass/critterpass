/**
 * Crew live map's registrations into other areas, imported once by the root layout: the crew
 * chat's MAP pill opens the crew map of that crew's trip (resolved by `/map/crew/{crewId}`).
 */
import { router } from 'expo-router';

import { registerChatMapTarget } from '../chat/slots';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
registerChatMapTarget((crewId) => router.push(`/map/crew/${crewId}`));
