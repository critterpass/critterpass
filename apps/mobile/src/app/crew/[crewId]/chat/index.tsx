import { ChatScreen } from '@/features/crew/chat/components/chat-screen';
import { DeviceChatMediaProvider } from '@/features/crew/chat/media/device-media';
import { PremiumCrewChatScreen } from '@/features/crew/premium/chat/crew-chat-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentCrewChatRoute() {
  return (
    <DeviceChatMediaProvider>
      <ChatScreen />
    </DeviceChatMediaProvider>
  );
}

export default premiumRoute({ premium: PremiumCrewChatScreen, legacy: CurrentCrewChatRoute });
