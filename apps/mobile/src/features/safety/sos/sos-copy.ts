/** The SOS's words both pages use: each of the guide's steps, and where each responder is. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import type { SosModel, SosResponder, SosStepView } from './sos-model';

/** "SOS sent to all 5 of you", "Ops desk is calling the clinic with you". */
export function useSosStepText(model: SosModel): (step: SosStepView) => string {
  const { t } = useLingui();
  const name = model.senderName;
  return (step: SosStepView): string => {
    switch (step.key) {
      case 'sent': {
        const n = step.n ?? 0;
        if (!step.done) {
          return t({ id: 'safety.sos.stepSending', message: 'Sending the SOS to the crew' });
        }
        return n === 0
          ? t({ id: 'safety.sos.stepSentNobody', message: 'Nobody else is on this trip to alert' })
          : t({
              id: 'safety.sos.stepSent',
              message: plural(n, {
                one: 'SOS sent to your one crewmate',
                other: 'SOS sent to all # of you',
              }),
            });
      }
      case 'location_live':
        return model.role === 'sender'
          ? t({
              id: 'safety.sos.stepLiveYou',
              message: 'Your location stays live until you are safe',
            })
          : t({
              id: 'safety.sos.stepLive',
              message: `${name}’s location stays live until they are safe`,
            });
      case 'ops_clinic':
        return t({
          id: 'safety.sos.stepClinic',
          message: 'Ops desk is calling the clinic with you',
        });
      case 'insurance':
        return step.done
          ? t({
              id: 'safety.sos.stepInsuranceSent',
              message: 'Insurance details went to the clinic',
            })
          : t({ id: 'safety.sos.stepInsurance', message: 'Insurance details wait for a yes' });
    }
  };
}

/** "Alex is going. 4 minutes away on foot." */
export function useResponderLine(): (responder: SosResponder) => string {
  const { t } = useLingui();
  return (responder) => {
    const who = responder.name;
    const eta = responder.etaMin;
    return responder.arrived
      ? t({ id: 'safety.sos.arrived', message: `${who} is there.` })
      : eta === null
        ? t({ id: 'safety.sos.going', message: `${who} is going.` })
        : t({
            id: 'safety.sos.goingEta',
            message: `${who} is going. ${eta} minutes away on foot.`,
          });
  };
}
