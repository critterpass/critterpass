import { InviteComposerScreen } from '@/features/crew/invite-composer/InviteComposerScreen';
import { InviteSheet } from '@/features/crew/premium/invite-sheet';
import { premiumRoute } from '@/lib/premium-ui';

import { isContactPickerAvailable, pickContact } from '../../../../modules/cp-contact-picker';

/** The composer with the system contact picker, when this binary links it. */
function InviteRoute() {
  return <InviteComposerScreen pickContact={isContactPickerAvailable() ? pickContact : null} />;
}

/** Inviting to a crew: the premium invite sheet (3.10), or the current composer. */
export default premiumRoute({ premium: InviteSheet, legacy: InviteRoute });
