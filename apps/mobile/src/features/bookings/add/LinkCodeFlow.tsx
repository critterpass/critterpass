/** The link-code sheet with its send: `verify_sender_email` for the crew the wallet is on. */
import { LinkCodeSheet } from '../link-code/LinkCodeSheet';
import { useLinkCode } from './use-link-code';

export function LinkCodeFlow({
  crewId,
  onDone,
}: {
  readonly crewId: string | null;
  readonly onDone: () => void;
}) {
  const linkCode = useLinkCode(crewId);
  return <LinkCodeSheet state={linkCode.state} onLink={linkCode.link} onClose={onDone} />;
}
