import { ChatScreen } from '@/features/crew/chat/components/chat-screen';
import { DeviceChatMediaProvider } from '@/features/crew/chat/media/device-media';

export default function CrewChatRoute() {
  return (
    <DeviceChatMediaProvider>
      <ChatScreen />
    </DeviceChatMediaProvider>
  );
}
