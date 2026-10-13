/**
 * Settings › Crew chat on the premium page: the row opens in place to the three choices as pills
 * (the same pick the pings page offers per crew), the current one inked. Picking saves at once and
 * folds the row back.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Button,
  enterTransition,
  Icon,
  Row,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { CrewChatMode } from '../../ping-settings/ping-prefs';

const MODES: readonly CrewChatMode[] = ['all', 'mentions', 'off'];

export function CrewChatChoice(props: {
  readonly title: string;
  readonly value: string;
  readonly selected: CrewChatMode;
  readonly onSelect: (mode: CrewChatMode) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const [open, setOpen] = useState(false);
  const label: Readonly<Record<CrewChatMode, string>> = {
    all: t({ id: 'you.pings.crewChat.all', message: 'Every message' }),
    mentions: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
    off: t({ id: 'you.pings.crewChat.off', message: 'Off' }),
  };
  return (
    <View>
      <Row
        title={props.title}
        trailingText={props.value}
        trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
        onPress={() => setOpen((on) => !on)}
        testID="you-settings-crew-chat"
      />
      {open ? (
        <Animated.View
          entering={enterTransition(reduced)}
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: th.space.gap6,
            paddingHorizontal: th.space.rowPadH,
            paddingBottom: th.space.gap12,
          }}
          testID="you-settings-crew-chat-sheet"
        >
          {MODES.map((mode) => (
            <Button
              key={mode}
              label={label[mode]}
              size="small"
              variant={mode === props.selected ? 'primary' : 'floating'}
              onPress={() => {
                props.onSelect(mode);
                setOpen(false);
              }}
              testID={`you-settings-crew-chat-sheet-${mode}`}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
