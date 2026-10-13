/**
 * "2 · How you travel" on 3a-12: the picked tags first (prefilled from the inviter's confirmed
 * tags), a few more to choose from, and + MORE for every tag the quiz knows. Picks are recorded as
 * chip answers on the pass draft.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import type { TasteTag } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { makeStyles } from '@/ui/theme';

import { tagWords } from '../taste/tag-labels';
import { shownTags } from './travel-tags';

const useStyles = makeStyles((th) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
}));

export interface TravelChipsProps {
  readonly selected: readonly TasteTag[];
  readonly onToggle: (tag: TasteTag) => void;
}

export function TravelChips({ selected, onToggle }: TravelChipsProps) {
  const styles = useStyles();
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const chips = shownTags(selected, more);
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
