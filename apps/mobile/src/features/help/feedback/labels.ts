/** The words for each mood and topic, shared by the form and the note the sent page pins. */
import { useLingui } from '@lingui/react/macro';
import type { FeedbackCategory, FeedbackMood } from '@cp/domain';

export function useFeedbackLabels(): {
  readonly moods: Readonly<Record<FeedbackMood, string>>;
  readonly topics: Readonly<Record<FeedbackCategory, string>>;
} {
  const { t } = useLingui();
  const moods: Readonly<Record<FeedbackMood, string>> = {
    grr: t({ id: 'help.feedback.mood.grr', message: 'Grr' }),
    meh: t({ id: 'help.feedback.mood.meh', message: 'Meh' }),
    okay: t({ id: 'help.feedback.mood.okay', message: 'Okay' }),
    good: t({ id: 'help.feedback.mood.good', message: 'Good' }),
    love: t({ id: 'help.feedback.mood.love', message: 'Love it' }),
  };
  const topics: Readonly<Record<FeedbackCategory, string>> = {
    bug: t({ id: 'help.feedback.topic.bug', message: 'Bug' }),
    planning: t({ id: 'help.feedback.topic.planning', message: 'Planning' }),
    money: t({ id: 'help.feedback.topic.money', message: 'Money' }),
    guide_chat: t({ id: 'help.feedback.topic.guideChat', message: 'Guide chat' }),
    critters: t({ id: 'help.feedback.topic.critters', message: 'Critters' }),
    other: t({ id: 'help.feedback.topic.other', message: 'Other' }),
  };
  return { moods, topics };
}
