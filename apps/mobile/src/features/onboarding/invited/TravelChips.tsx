/**
 * "2 · How you travel" on 3a-12: the picked tags first (prefilled from the inviter's confirmed
 * tags), a few more to choose from, and + MORE for every tag the quiz knows. Picks are recorded as
 * chip answers on the pass draft.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { TASTE_TAGS, type TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { makeStyles } from '@/ui/theme';

import { onboardingQuiz } from '../content';
import { tagWords } from '../taste/tag-labels';

const SHOWN_CHIPS = 3;

const useStyles = makeStyles((th) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
}));

function quizTags(): TasteTag[] {
  const seen = new Set<TasteTag>();
  for (const q of onboardingQuiz()) {
    for (const tag of [...q.left.tags, ...q.right.tags]) seen.add(tag);
  }
  return TASTE_TAGS.filter((tag) => seen.has(tag));
}

export interface TravelChipsProps {
  readonly selected: readonly TasteTag[];
  readonly onToggle: (tag: TasteTag) => void;
}

export function TravelChips({ selected, onToggle }: TravelChipsProps) {
  const styles = useStyles();
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const all = quizTags();
  const chips = more
    ? all
    : [...selected, ...all.filter((tag) => !selected.includes(tag))].slice(
        0,
        Math.max(SHOWN_CHIPS, selected.length),
      );
  return (
    <View style={styles.chips}>
      {chips.map((tag) => (
        <ChoiceChip
          key={tag}
          label={upper(tagWords(tag).full, locale)}
          selected={selected.includes(tag)}
          onPress={() => onToggle(tag)}
          testID={`invite-pass-chip-${tag}`}
        />
      ))}
      {more ? null : (
        <ChoiceChip
          label={t({ id: 'onboarding.invite.pass.more', message: '+ More' })}
          selected={false}
          onPress={() => setMore(true)}
          testID="invite-pass-more"
        />
      )}
    </View>
  );
}
