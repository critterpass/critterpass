/**
 * One guide answer in the sheet: the persona's words in the guide's voice and colour, typed in word
 * by word while they stream, the web sources it cites as chips (tap opens the page), and the
 * answer's actions (copy, helpful, not helpful): shown under the latest answer, a long press away
 * on earlier ones. While the guide thinks, typing dots;
 * a tool that takes a while gets a filler line so the wait reads as work.
 */
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Linking, Pressable } from 'react-native';

import { tidyGuideText } from '@/features/crew';
import { patterns } from '@/motion';
import { Row, Stack, Text, useTheme } from '@/ui';
import { TypingDots } from '@/ui/chat/TypingDots';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';

import { sourceLabel } from '../data/turn-state';

/** How long a tool may run before the filler line shows. */
export const FILLER_AFTER_MS = 4000;

export function SourceChips({ sources }: { readonly sources: readonly string[] }) {
  if (sources.length === 0) return null;
  return (
    <Row gap="6" wrap testID="guide-sources">
      {sources.map((url) => (
        <QuickActionChip
          key={url}
          label={sourceLabel(url)}
          onPress={() => void Linking.openURL(url)}
          testID={`guide-source-${sourceLabel(url)}`}
        />
      ))}
    </Row>
  );
}

export function GuideThinking({
  color,
  checking,
}: {
  readonly color: string;
  readonly checking: boolean;
}) {
  const { t } = useLingui();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!checking) return undefined;
    const timer = setTimeout(() => setSlow(true), FILLER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [checking]);
  return (
    <Stack gap="6" testID="guide-thinking">
      <TypingDots color={color} />
      {checking && slow ? (
        <Text variant="voice" color={color} testID="guide-filler">
          {t({ id: 'guide.chat.filler', message: 'Still checking, one moment…' })}
        </Text>
      ) : null}
    </Stack>
  );
}

export interface GuideAnswerProps {
  readonly text: string;
  readonly color: string;
  readonly streaming?: boolean;
  readonly sources?: readonly string[];
  /** Rates a saved answer; absent while it streams. */
  readonly onRate?: (verdict: 'up' | 'down') => void;
  readonly rating?: string | null;
  /** The actions are shown without a long press (the latest answer). */
  readonly actionsShown?: boolean;
  readonly testID?: string;
}

export function GuideAnswer({
  text,
  color,
  streaming = false,
  sources = [],
  onRate,
  rating = null,
  actionsShown = false,
  testID,
}: GuideAnswerProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const [opened, setActions] = useState(false);
  const [rated, setRated] = useState(false);
  // A rated answer has had its say: the line under it replaces the chips.
  const actions = opened || (actionsShown && !rated && rating === null && !streaming);
  const [copied, setCopied] = useState(false);
  // Brackets inside brackets (a gloss within a gloss) are shown, and copied, as one pair.
  const line = tidyGuideText(text);
  // Only the answer being written types itself out; a saved one is whole and starts no timer.
  const typed = patterns.useTypewriter({ text: line, enabled: streaming });
  const shown = streaming ? typed.visibleText : line;
  return (
    <Stack gap="8" {...(testID === undefined ? {} : { testID })}>
      <Pressable
        onLongPress={() => setActions((open) => !open)}
        accessibilityHint={t({ id: 'guide.chat.actionsHint', message: 'Long press for actions' })}
      >
        <Text variant="voice" color={color}>
          {streaming ? `${shown}|` : shown}
        </Text>
      </Pressable>
      <SourceChips sources={sources} />
      {actions ? (
        <Row gap="6" wrap testID="guide-answer-actions">
          <QuickActionChip
            label={
              copied
                ? t({ id: 'guide.chat.copied', message: 'Copied' })
                : t({ id: 'guide.chat.copy', message: 'Copy' })
            }
            onPress={() => {
              void Clipboard.setStringAsync(line);
              setCopied(true);
            }}
            testID="guide-answer-copy"
          />
          {onRate === undefined ? null : (
            <>
              <QuickActionChip
                label={t({ id: 'guide.chat.helpful', message: 'Helpful' })}
                onPress={() => {
                  onRate('up');
                  setRated(true);
                  setActions(false);
                }}
                testID="guide-answer-up"
              />
              <QuickActionChip
                label={t({ id: 'guide.chat.notHelpful', message: 'Not helpful' })}
                onPress={() => {
                  onRate('down');
                  setRated(true);
                  setActions(false);
                }}
                testID="guide-answer-down"
              />
            </>
          )}
        </Row>
      ) : null}
      {rating === null ? null : (
        <Text variant="caption" color={theme.semantic.text.tertiary}>
          {rating === 'up'
            ? t({ id: 'guide.chat.ratedUp', message: 'You found this helpful' })
            : t({ id: 'guide.chat.ratedDown', message: 'You found this unhelpful' })}
        </Text>
      )}
    </Stack>
  );
}
