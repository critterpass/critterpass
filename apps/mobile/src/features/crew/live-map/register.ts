/**
 * Crew live map's registrations into other areas, imported once by the root layout: the crew
 * chat's MAP pill opens the crew map of that crew's trip (resolved by `/map/crew/{crewId}`). The
 * guide's meet-up image is rendered into the sticker cache ahead of time, so the first map draws it
 * at once instead of a moment after the pin.
 */
import { router } from 'expo-router';

import { guideSticker } from '@/ui/avatar/guides';

import { registerChatMapTarget } from '../chat/slots';
import { GUIDE_IMAGE_PT, renderGuidePng } from './map/guide-image';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
registerChatMapTarget((crewId) => router.push(`/map/crew/${crewId}`));

// Idle-time warm-up; a failure only means the first map renders the image itself.
setTimeout(() => {
  renderGuidePng(guideSticker('tokek').kind, GUIDE_IMAGE_PT).catch(() => undefined);
}, 3000);
