/** The version's title and lines, true for the reader (the same words as the current look). */
import { t } from '@lingui/core/macro';

import type { YourVersionViewProps } from '../../your-version/your-version-view';

type Reader = Pick<YourVersionViewProps, 'name' | 'preview' | 'group' | 'personalised'>;

export function versionTitle({ name, preview, group, personalised }: Reader): string {
  if (preview) return t({ id: 'proposal.version.titlePreview', message: `${name}’s version` });
  return group || !personalised
    ? t({ id: 'proposal.version.titleGroup', message: `${name}, here’s the plan` })
    : t({ id: 'proposal.version.title', message: `${name}, here’s your version` });
}

export function versionSubLine(
  props: Pick<YourVersionViewProps, 'group' | 'personalised' | 'organiser'>,
  guide: string,
): string {
  if (props.group) {
    return t({
      id: 'proposal.version.subGroup',
      message: `${guide} wrote one plan for the whole crew. Tap a stop to open it.`,
    });
  }
  if (props.personalised) {
    return t({
      id: 'proposal.version.sub',
      message: `${guide} rebuilt the plan around what you picked. Tap anything to see why it’s there.`,
    });
  }
  const organiser = props.organiser;
  return organiser === ''
    ? t({
        id: 'proposal.version.subPlainNoName',
        message: `Here is the plan ${guide} put together for the crew. Tap anything to see why it’s there.`,
      })
    : t({
        id: 'proposal.version.subPlain',
        message: `Here is the plan ${organiser} and ${guide} put together. Tap anything to see why it’s there.`,
      });
}

export function versionAnsweredLine(answer: 'in' | 'out' | 'waitlisted'): string {
  switch (answer) {
    case 'in':
      return t({ id: 'proposal.version.youreIn', message: 'You’re in. See you there.' });
    case 'waitlisted':
      return t({ id: 'proposal.version.waitlisted', message: 'You’re on the waitlist.' });
    case 'out':
      return t({ id: 'proposal.version.out', message: 'You said you can’t make it.' });
  }
}
