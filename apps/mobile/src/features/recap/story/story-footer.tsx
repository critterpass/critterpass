/**
 * The playing card's one action under the narration: VOTE FOR THE MVP on the awards, REMIND ME
 * on the one that got away (when it comes back in season), and SIGN IT on the stamp while the
 * traveller has no signature yet. Other cards have none.
 */
import type { RecapCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';

export interface StoryFooterProps {
  readonly card: RecapCard;
  readonly canVote: boolean;
  readonly canRemind: boolean;
  readonly reminded: boolean;
  /** The got-away's next window start, for "Remind me in May". */
  readonly nextWindow: string | null;
  readonly canSign: boolean;
  readonly onVote: () => void;
  readonly onRemind: () => void;
  readonly onSign: () => void;
}

export function StoryFooter(props: StoryFooterProps) {
  const { t } = useLingui();
  const locale = useLocale();
  if (props.card === 'awards' && props.canVote) {
    return (
      <PillButton
        label={t({ id: 'recap.story.voteMvp', message: 'Vote for the MVP' })}
        tone="pink"
        onPress={props.onVote}
        testID="recap-story-vote"
      />
    );
  }
  if (props.card === 'got_away' && props.canRemind) {
    const month =
      props.nextWindow === null
        ? null
        : new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
            // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix.
            new Date(`${props.nextWindow}T12:00:00Z`),
          );
    return (
      <PillButton
        label={
          props.reminded
            ? t({ id: 'recap.story.reminded', message: "I'll remind you" })
            : month === null
              ? t({ id: 'recap.story.remind', message: 'Remind me' })
              : t({ id: 'recap.story.remindIn', message: `Remind me in ${month}` })
        }
        tone="yellow"
        onPress={props.onRemind}
        testID="recap-story-remind"
      />
    );
  }
  if (props.card === 'stamp' && props.canSign) {
    return (
      <PillButton
        label={t({ id: 'recap.story.sign', message: 'Sign it' })}
        tone="cream"
        onPress={props.onSign}
        testID="recap-story-sign"
      />
    );
  }
  return null;
}
