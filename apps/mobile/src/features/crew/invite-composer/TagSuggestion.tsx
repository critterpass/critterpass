/**
 * The guide's suggestion under the composer's note (undesigned; from the guide line and pill
 * button): the guide's line about the friend and, when it read any taste from the note, a button
 * that picks those tags. The inviter can still change every chip afterwards.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { InviteTagsResponse } from '@cp/domain';

import { guideSticker, isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles } from '@/ui/theme';

import { tagWords } from '../../onboarding';

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['8'], alignItems: 'flex-start' },
}));

function guideOf(slug: string): GuideStickerId {
  return isGuideStickerId(slug) ? slug : 'tokek';
}

export function TagSuggestion({
  suggestion,
  onUse,
}: {
  readonly suggestion: InviteTagsResponse;
  readonly onUse: () => void;
}) {
  const styles = useStyles();
  const guide = guideOf(suggestion.guide);
  const sticker = guideSticker(guide);
  const words = suggestion.tags.map((tag) => tagWords(tag).full).join(' · ');
  return (
    <View style={styles.root} testID="composer-suggestion">
      {suggestion.line === '' ? null : (
        <GuideLine
          guide={guide}
          name={sticker.name}
          line={suggestion.line}
          sticker={<Sticker kind={sticker.kind} name={sticker.name} size={40} />}
        />
      )}
      {suggestion.tags.length === 0 ? null : (
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'crew.composer.useSuggestion', message: `Use ${words}` })}
          onPress={onUse}
          testID="composer-suggestion-use"
        />
      )}
    </View>
  );
}
