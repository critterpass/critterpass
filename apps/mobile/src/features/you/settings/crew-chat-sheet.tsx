/** Settings › Crew chat: how much a crew's messages ping, the same choice the pings screen offers. */
import { useLingui } from '@lingui/react/macro';

import { ChoiceSheet } from '../ping-settings/choice-sheet';
import type { CrewChatMode } from '../ping-settings/ping-prefs';

export function CrewChatSheet(props: {
  readonly selected: CrewChatMode;
  readonly onSelect: (mode: CrewChatMode) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <ChoiceSheet
      title={t({ id: 'you.pings.crewChat', message: 'Crew chat' })}
      choices={[
        { key: 'all', title: t({ id: 'you.pings.crewChat.all', message: 'Every message' }) },
        {
          key: 'mentions',
          title: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
        },
        { key: 'off', title: t({ id: 'you.pings.crewChat.off', message: 'Off' }) },
      ]}
      selected={props.selected}
      onSelect={props.onSelect}
      onClose={props.onClose}
      testID="you-settings-crew-chat-sheet"
    />
  );
}
