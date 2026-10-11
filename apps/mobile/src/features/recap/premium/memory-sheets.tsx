/**
 * The year-later memory's sheets in the premium look: reacting (an emoji, a short line of up to 40
 * characters, either or both; a new reaction replaces your last one) and sharing the memory's
 * picture with the crew's signatures.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  PressableScale,
  Text,
  TextField,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { useMemoryShare, type MemoryShareSheetProps } from '../memory/memory-share-sheet';
import { MEMORY_EMOJI, MEMORY_LINE_MAX, type ReactionSheetProps } from '../memory/reaction-sheet';
import { PremiumShareSheet } from './premium-share-sheet';
import { PremiumSheet } from './premium-sheet';

const useStyles = makePremiumStyles((th) => ({
  chip: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

export function PremiumReactionSheet({ initial, onSend, onClose }: ReactionSheetProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [text, setText] = useState(initial?.text ?? '');
  const line = text.trim();
  return (
    <PremiumSheet
      title={t({ id: 'recap.memory.reactTitle', message: 'React to the memory' })}
      onClose={onClose}
      testID="memory-react-sheet"
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MEMORY_EMOJI.map((value) => (
          <PressableScale
            key={value}
            style={[styles.chip, emoji === value ? { backgroundColor: th.color.ink } : null]}
            onPress={() => setEmoji(emoji === value ? null : value)}
            accessibilityRole="button"
            accessibilityState={{ selected: emoji === value }}
            testID={`memory-emoji-${value}`}
          >
            <Text variant="rowTitle" tone={emoji === value ? 'onInk' : 'ink'}>
              {value}
            </Text>
          </PressableScale>
        ))}
      </View>
      <TextField
        accessibilityLabel={t({ id: 'recap.memory.lineLabel', message: 'Say something' })}
        placeholder={t({ id: 'recap.memory.lineLabel', message: 'Say something' })}
        value={text}
        onChangeText={(next) => setText(next.slice(0, MEMORY_LINE_MAX))}
        maxLength={MEMORY_LINE_MAX}
        helper={`${line.length}/${MEMORY_LINE_MAX}`}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (emoji !== null || line !== '') onSend({ emoji, text: line === '' ? null : line });
        }}
        testID="memory-react-line"
      />
      <Button
        label={t({ id: 'recap.memory.send', message: 'Send' })}
        disabled={emoji === null && line === ''}
        onPress={() => onSend({ emoji, text: line === '' ? null : line })}
        testID="memory-react-send"
      />
    </PremiumSheet>
  );
}

export function PremiumMemoryShare(props: MemoryShareSheetProps) {
  const share = useMemoryShare(props);
  return (
    <PremiumShareSheet
      altText={share.altText}
      render={share.render}
      deps={share.deps}
      onClose={props.onClose}
      testID="memory-share"
    />
  );
}
