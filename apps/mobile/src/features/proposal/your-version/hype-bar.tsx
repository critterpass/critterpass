/**
 * CREW HYPE (3f-3): the crew-level hype percentage and one line built only from what people chose
 * to post: the latest public reply ("Jordan replied “6AM??”") and how many reacted. Nobody's
 * opens or views are ever shown.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { GrowBar } from '@/ui/data/LinearBar';
import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { Hype } from '../data/proposal';

const useStyles = makeStyles((th) => ({
  wrap: { gap: th.space['8'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  grow: { flex: 1 },
  track: {
    height: th.space['12'],
    borderRadius: th.radius.pill,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
  },
}));

export function reactionWords(kind: string): string {
  switch (kind) {
    case 'okay_wow':
      return t({ id: 'proposal.reaction.okayWow', message: 'OKAY WOW' });
    case 'six_am':
      return t({ id: 'proposal.reaction.sixAm', message: '6AM??' });
    case 'im_in':
      return t({ id: 'proposal.reaction.imIn', message: 'I’M IN' });
    case 'heart':
      return '♥';
    case 'fire':
      return t({ id: 'proposal.reaction.fire', message: 'On fire' });
    default:
      return t({ id: 'proposal.reaction.laugh', message: 'Ha!' });
  }
}

export interface HypeBarProps {
  readonly hype: Hype | null;
  readonly latest: { readonly name: string; readonly kind: string } | null;
}

export function HypeBar({ hype, latest }: HypeBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const pct = hype?.pct ?? 0;
  const parts: string[] = [];
  if (latest !== null) {
    const words = reactionWords(latest.kind);
    parts.push(t({ id: 'proposal.hype.replied', message: `${latest.name} replied “${words}”.` }));
  }
  if (hype !== null && hype.recipients > 0) {
    const reacted = hype.reacted;
    const recipients = hype.recipients;
    parts.push(t({ id: 'proposal.hype.count', message: `${reacted} of ${recipients} reacted.` }));
  }
  return (
    <View style={styles.wrap} testID="version-hype">
      <View style={styles.head}>
        <Icon name="flame" size={18} decorative />
        <View style={styles.grow}>
          <Text variant="eyebrow">{t({ id: 'proposal.hype.title', message: 'Crew hype' })}</Text>
        </View>
        <Text variant="title" color={theme.semantic.action.primary}>
          {t({ id: 'proposal.hype.pct', message: `${pct}%` })}
        </Text>
      </View>
      <View style={styles.track}>
        <GrowBar fraction={pct / 100} color={theme.color.pink} />
      </View>
      {parts.length === 0 ? null : (
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {parts.join(' ')}
        </Text>
      )}
    </View>
  );
}
