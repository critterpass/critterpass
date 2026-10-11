/**
 * The premium crew chat (5.01–5.12): the gradient header, the timeline pinned to the bottom, the
 * composer with the sticker tray that swaps with the keyboard at its height, the long-press menu,
 * and the states (brand new, offline, read-only after leaving). All data and commands come from the
 * chat's hooks, the same ones the current chat uses.
 */
import { t } from '@lingui/core/macro';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useContext } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { LoadingCritter } from '@/ui/premium';

import { DeviceChatMediaProvider } from '../../chat/media/device-media';
import { CrewChatView } from './crew-chat-view';

export function PremiumCrewChatScreen() {
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const localFirst = useContext(LocalFirstContext);
  return (
    <DeviceChatMediaProvider>
      <Stack.Screen options={{ headerShown: false }} />
      {localFirst === null ? (
        <LoadingCritter label={t({ id: 'chat.premium.opening', message: 'Opening the chat…' })} />
      ) : (
        <CrewChatView crewId={crewId} />
      )}
    </DeviceChatMediaProvider>
  );
}
