import { InviteComposerScreen } from '@/features/crew/invite-composer/InviteComposerScreen';

import { isContactPickerAvailable, pickContact } from '../../../../modules/cp-contact-picker';

/** The composer with the system contact picker, when this binary links it. */
export default function InviteRoute() {
  return <InviteComposerScreen pickContact={isContactPickerAvailable() ? pickContact : null} />;
}
