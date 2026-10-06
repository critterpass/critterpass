/**
 * Settings' HELP AND FEEDBACK rows (3n-6), each behind its coloured icon tile: rate in the store,
 * send feedback, suggest a feature (with the idea board's open count when it has any) and the
 * help centre. Rate is left out when this build has no store page to open.
 */
import { t } from '@lingui/core/macro';

import type { SettingsRow } from '@/ui/inputs/SettingsGroup';

import type { SettingsHandlers, SettingsValues } from './settings-sections';

export function helpRows(
  values: Pick<SettingsValues, 'storeName' | 'ideasToVote' | 'shakeToReport'>,
  handlers: Pick<
    SettingsHandlers,
    'onRate' | 'onFeedback' | 'onIdea' | 'onHelpCentre' | 'onShakeToReport'
  >,
): Readonly<
  Record<'rate' | 'feedback' | 'shake-to-report' | 'idea' | 'help-centre', SettingsRow | null>
> {
  const ideas = values.ideasToVote;
  return {
    rate:
      handlers.onRate === null
        ? null
        : {
            key: 'rate',
            kind: 'value',
            leading: { icon: 'heart', tint: 'pink' },
            title: t({ id: 'you.settings.rate', message: 'Rate CritterPass' }),
            subtitle: values.storeName,
            value: '',
            valueIcon: 'star',
            onPress: handlers.onRate,
          },
    feedback: {
      key: 'feedback',
      kind: 'value',
      leading: { icon: 'chat', tint: 'yellow' },
      title: t({ id: 'you.settings.feedback', message: 'Send feedback' }),
      subtitle: t({ id: 'you.settings.feedbackLine', message: 'Straight to the team' }),
      value: '',
      onPress: handlers.onFeedback,
    },
    'shake-to-report':
      typeof values.shakeToReport === 'boolean' && handlers.onShakeToReport !== undefined
        ? {
            key: 'shake-to-report',
            kind: 'toggle',
            title: t({ id: 'you.settings.shakeToReport', message: 'Shake to report' }),
            subtitle: t({
              id: 'you.settings.shakeToReportLine',
              message: 'Shake any screen to report a problem with a screenshot',
            }),
            value: values.shakeToReport,
            onChange: handlers.onShakeToReport,
          }
        : null,
    idea: {
      key: 'idea',
      kind: 'value',
      leading: { icon: 'spark', tint: 'blue' },
      title: t({ id: 'you.settings.idea', message: 'Suggest a feature' }),
      subtitle:
        ideas === null || ideas === 0
          ? t({ id: 'you.settings.ideaLine', message: 'Tell us what you’d add' })
          : t({
              id: 'you.settings.ideasToVote',
              message: `${ideas} ideas to vote on`,
            }),
      value: '',
      onPress: handlers.onIdea,
    },
    'help-centre': {
      key: 'help-centre',
      kind: 'value',
      leading: { icon: 'pin', tint: 'green' },
      title: t({ id: 'you.settings.helpCentre', message: 'Help centre' }),
      value: '',
      onPress: handlers.onHelpCentre,
    },
  };
}
