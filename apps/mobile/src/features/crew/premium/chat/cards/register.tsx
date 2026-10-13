/**
 * The premium chat's own cards, registered once as the chat loads. Kinds other areas own (polls,
 * expenses, plan changes, proposals, guide offers, boosts) register theirs with
 * `registerPremiumChatCard`; a kind nobody registered draws the "unknown" card.
 */
import { registerPremiumChatCard } from './registry';
import { PhotoCard, UnknownCard, VoiceCard } from './media-cards';

registerPremiumChatCard('photo', {
  render: (message, mine) => <PhotoCard message={message} mine={mine} />,
});
registerPremiumChatCard('voice', {
  render: (message, mine) => <VoiceCard message={message} mine={mine} />,
});
registerPremiumChatCard('unknown', {
  render: (message) => <UnknownCard message={message} />,
});
