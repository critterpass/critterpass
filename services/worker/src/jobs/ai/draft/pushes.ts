/**
 * The draft-ready push ("{Guide}'s draft is ready"), to the organiser who asked for the draft only,
 * opening the private review. The catalogue sends it only while their app is in the background.
 */
import { DRAFT_READY_BODY, DRAFT_READY_TITLE, tripDraftLink } from '@cp/domain';

import { registerNotification } from '../../notify/register';
import { setupFacts, str } from '../../setup/facts';

export function registerDraftPushes(): void {
  registerNotification({
    key: 'draft_ready',
    event: 'draft.ready',
    audience: (_tx, event) => {
      const organiser = str(event, 'user_id');
      return Promise.resolve(organiser === null ? [] : [organiser]);
    },
    async compose(tx, event, uid) {
      const tripId = str(event, 'trip_id');
      if (tripId === null || str(event, 'user_id') !== uid) return null;
      const facts = await setupFacts(tx, tripId);
      if (facts === undefined) return null;
      return {
        title: DRAFT_READY_TITLE,
        body: DRAFT_READY_BODY,
        vars: { guide: facts.guide.name, place: facts.place },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId,
        deepLink: tripDraftLink(tripId),
        ctx: { version_id: str(event, 'version_id') },
        collapseVars: { trip_id: tripId },
      };
    },
  });
}
