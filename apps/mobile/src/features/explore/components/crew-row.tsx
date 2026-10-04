/**
 * The crew on a place: the avatars of who saved it or swiped yes, beside the crew's own Q&A line
 * about it (from this trip's chat) or, without one, who is keen.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { guideWritten } from '../data/guide-text';

export interface CrewRowProps {
  /** Crewmates who saved the place or said yes to it, in the crew's own order. */
  readonly keen: readonly StackMember[];
  /** The crew's Q&A line about the place, when the chat has one. */
  readonly qna: string | null;
  /**
   * The faces are who saved it (the planning place page): "Alex and Rin saved it." leads, then
   * the Q&A line.
   */
  readonly savers?: boolean | undefined;
}

export function CrewRow({ keen, qna, savers = false }: CrewRowProps) {
  const theme = useTheme();
  const { t, i18n } = useLingui();
  if (keen.length === 0 && qna === null) return null;
  const names = format.list(
    i18n.locale,
    keen.slice(0, 3).map((member) => member.name),
  );
  const more = Math.max(0, keen.length - 3);
  const answer = qna === null ? null : guideWritten(qna, i18n.locale);
  const saved =
    keen.length === 0
      ? null
      : more > 0
        ? t({ id: 'explore.crew.savedMore', message: `${names} and ${more} more saved it.` })
        : t({ id: 'explore.crew.saved', message: `${names} saved it.` });
  const line = savers
    ? [saved, answer].filter((part): part is string => part !== null).join(' ')
    : qna !== null
      ? guideWritten(qna, i18n.locale)
      : more > 0
        ? t({ id: 'explore.crew.keenMore', message: `${names} and ${more} more are keen on this.` })
        : keen.length === 1
          ? t({ id: 'explore.crew.keenOne', message: `${names} is keen on this.` })
          : t({ id: 'explore.crew.keen', message: `${names} are keen on this.` });
  return (
    <Row gap="12" align="flex-start" testID="explore-crew-row">
      {keen.length === 0 ? null : <AvatarStack members={keen} max={3} />}
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {line}
        </Text>
      </View>
    </Row>
  );
}
