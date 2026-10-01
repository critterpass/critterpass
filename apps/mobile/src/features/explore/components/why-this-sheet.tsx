/**
 * WHY THIS? for the card on top: the signals that put it in the deck, worded by the app (never by
 * a model), and the guide's note when there is one. It rises over the deck and closes on a tap.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { guideWritten } from '../data/guide-text';
import type { WhyLine } from '../swipe-model';

export interface WhyThisSheetProps {
  readonly placeName: string;
  readonly guideName: string;
  readonly lines: readonly WhyLine[];
  readonly note: string | null;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  veil: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: t.color.scrim.hex,
    opacity: t.color.scrim.alphaMax,
  },
  sheet: {
    borderTopLeftRadius: t.radius.sheetTop,
    borderTopRightRadius: t.radius.sheetTop,
    backgroundColor: t.semantic.bg.raised,
    padding: t.space['20'],
    paddingBottom: t.space['32'],
    gap: t.space['12'],
  },
}));

export function WhyThisSheet({ placeName, guideName, lines, note, onClose }: WhyThisSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const worded = lines.map((line) => {
    if (line.kind === 'mustSee') {
      return t({
        id: 'explore.swipe.whyMustSee',
        message: `It's one of ${guideName}'s must-sees.`,
      });
    }
    if (line.kind === 'taste') {
      const tag = line.tag;
      return t({ id: 'explore.swipe.whyTaste', message: `It fits what the crew likes: ${tag}.` });
    }
    if (line.kind === 'crewSaved') {
      return t({
        id: 'explore.swipe.whySaved',
        message: plural(line.count, {
          one: '# of the crew saved it.',
          other: '# of the crew saved it.',
        }),
      });
    }
    const minutes = Math.max(1, Math.round(line.meters / 80));
    return t({
      id: 'explore.swipe.whyNear',
      message: `It's about ${minutes} min on foot from the stay.`,
    });
  });
  return (
    <Pressable
      style={styles.veil}
      onPress={onClose}
      accessibilityRole="button"
      testID="explore-swipe-why-sheet"
    >
      <View style={styles.scrim} />
      <View style={styles.sheet}>
        <Text variant="eyebrow">
          {upper(t({ id: 'explore.swipe.whyTitle', message: `Why ${placeName}?` }), i18n.locale)}
        </Text>
        {worded.length === 0 && note === null ? (
          <Text variant="body">
            {t({
              id: 'explore.swipe.whyNone',
              message: `It's one of the places ${guideName} keeps for this destination.`,
            })}
          </Text>
        ) : null}
        {worded.map((line) => (
          <Text key={line} variant="body">
            {line}
          </Text>
        ))}
        {note === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {guideWritten(note, i18n.locale)}
          </Text>
        )}
        <PillButton
          label={t({ id: 'explore.swipe.whyClose', message: 'Got it' })}
          size="sm"
          block={false}
          variant="secondary"
          onPress={onClose}
          testID="explore-swipe-why-close"
        />
      </View>
    </Pressable>
  );
}
