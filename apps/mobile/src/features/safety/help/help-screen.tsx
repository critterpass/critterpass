/**
 * The Help hub (3k-6): its data and actions are `useHelpScreen`. Opening it asks once whether to
 * share where the traveller is with the crew for an hour; the phrase opens big on request.
 */
import { SosAlertAccessRows } from '../sos/alert-access-rows';
import { ConsentSheet } from './consent-sheet';
import { HelpView } from './help-view';
import { ShowIt } from './show-it';
import { useHelpScreen } from './use-help-screen';

export function HelpScreen() {
  const help = useHelpScreen();
  const { phrase } = help;
  return (
    <>
      <HelpView {...help.props} sosAccess={<SosAlertAccessRows />} />
      {help.asking ? <ConsentSheet crewName={help.crewName} onAnswer={help.answer} /> : null}
      {help.showIt && phrase !== null ? (
        <ShowIt
          phrase={phrase.text}
          lang={phrase.language}
          gloss={phrase.gloss}
          onClose={() => help.setShowIt(false)}
        />
      ) : null}
    </>
  );
}
