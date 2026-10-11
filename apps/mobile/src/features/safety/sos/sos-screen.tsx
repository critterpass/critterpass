/**
 * An SOS (3k-10): its data and actions are `useSosScreen`; before the incident row arrives the
 * sender sees it going out.
 */
import { SosPending } from './sos-pending';
import { SosView } from './sos-view';
import { useSosScreen } from './use-sos-screen';

export function SosScreen() {
  const sos = useSosScreen();
  if (sos.kind === 'pending') {
    return (
      <SosPending
        sent={sos.sent}
        general={sos.general}
        onCallGeneral={sos.onCallGeneral}
        onClose={sos.onClose}
      />
    );
  }
  return <SosView {...sos.props} />;
}
