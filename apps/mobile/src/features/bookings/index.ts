/**
 * The wallet's public surface for other features: its routes, the mailbox Settings row (3n-2),
 * the paywall entry and sign-in return for the mailbox, and the member's own insurance
 * policy for the Help hub line ("Insurance: Chubb Travel · the policy card is in Bookings").
 */
export { BOOKINGS_ROUTES, registerBookingsScreens } from './routes';
export { pickPolicy, useInsurancePolicies, type InsurancePolicy } from './insurance/insurance-data';
export { registerMailboxPaywall, type MailboxPaywall } from './mailbox/mailbox-slot';
export { useMailboxSettingsRow, type MailboxSettingsRow } from './mailbox/use-mailbox-row';
export { MailboxConnectedScreen } from './mailbox/MailboxConnectedScreen';
export { parseMailboxReturn } from './mailbox/oauth';
