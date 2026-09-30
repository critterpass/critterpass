/**
 * Where the mailbox connect sheet sends a member without Pass+: the paywall's `mailbox_import`
 * entry, registered by the monetisation area. Until it registers, the locked row explains and
 * offers no button.
 */
export type MailboxPaywall = () => void;

let paywall: MailboxPaywall | null = null;

export function registerMailboxPaywall(next: MailboxPaywall): () => void {
  paywall = next;
  return () => {
    if (paywall === next) paywall = null;
  };
}

export function mailboxPaywall(): MailboxPaywall | null {
  return paywall;
}
