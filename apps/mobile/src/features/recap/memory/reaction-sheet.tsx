/**
 * Reacting to the memory (3m-10, undesigned sheet): a row of emoji chips and a short line of up to
 * 40 characters, either or both; a new reaction replaces the traveller's last one.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

export const MEMORY_EMOJI = ['❤', '😂', '🥹', '🔥', '+1'] as const;
export const MEMORY_LINE_MAX = 40;

export interface MemoryReaction {
  readonly emoji: string | null;
  readonly text: string | null;
}

export interface ReactionSheetProps {
  readonly initial: MemoryReaction | null;
  readonly onSend: (reaction: MemoryReaction) => void;
  readonly onClose: () => void;
}

export function ReactionSheet({ initial, onSend, onClose }: ReactionSheetProps) {
  const { t } = useLingui();
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [text, setText] = useState(initial?.text ?? '');
  const line = text.trim();
  const title = t({ id: 'recap.memory.reactTitle', message: 'React to the memory' });
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="memory-react-sheet"
    >
      <Stack gap="16" padding="16">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        <Row gap="8" wrap>
          {MEMORY_EMOJI.map((value) => (
            <ChoiceChip
              key={value}
              label={value}
              selected={emoji === value}
              onPress={() => setEmoji(emoji === value ? null : value)}
              testID={`memory-emoji-${value}`}
            />
          ))}
        </Row>
        <TextField
          label={t({ id: 'recap.memory.lineLabel', message: 'Say something' })}
          value={text}
          onChangeText={(next) => setText(next.slice(0, MEMORY_LINE_MAX))}
          maxLength={MEMORY_LINE_MAX}
          message={`${line.length}/${MEMORY_LINE_MAX}`}
          testID="memory-react-line"
        />
        <PillButton
          label={t({ id: 'recap.memory.send', message: 'Send' })}
          tone="yellow"
          block
          disabled={emoji === null && line === ''}
          onPress={() => onSend({ emoji, text: line === '' ? null : line })}
          testID="memory-react-send"
        />
      </Stack>
    </Sheet>
  );
}
