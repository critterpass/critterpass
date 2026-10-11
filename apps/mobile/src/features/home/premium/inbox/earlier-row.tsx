/**
 * An "Earlier" row (3.17): who it is from (a 32 avatar in their crew colour, or the guide), the
 * line at 14/1.3, an Undo while the server keeps the window open, and how long ago. Unread rows
 * read in ink with a dot; read ones go muted. Opening marks it read.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import {
  Avatar,
  CritterSticker,
  Icon,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { shortAge } from '../../format';
import { guideArt } from '../../guide-art';
import type { InboxItem } from '../../inbox/inbox-data';
import type { InboxRenderContext, InboxRenderer } from '../../inbox/kind-renderers';
import type { InboxAction } from '@cp/domain';
import { memberAccent } from '../components/member-colour';

const SLOTS = ['yellow', 'orange', 'blue', 'pink', 'green', 'cream'] as const;

const useStyles = makePremiumStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap10,
    paddingVertical: t.space.rowPadVLoose,
    paddingHorizontal: t.space.rowPadH,
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space.gap10 },
  line: { flex: 1, lineHeight: 18.2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent.pink },
}));

export interface PremiumEarlierRowProps {
  readonly item: InboxItem;
  readonly renderer: InboxRenderer;
  readonly ctx: InboxRenderContext;
  readonly onUndo: (item: InboxItem, action: InboxAction) => void;
  readonly onOpen: (item: InboxItem) => void;
}

export function PremiumEarlierRow({ item, renderer, ctx, onUndo, onOpen }: PremiumEarlierRowProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const line = renderer.line(item, ctx);
  const undo = item.actions.find((action) => action.style === 'undo');
  const canUndo =
    undo !== undefined && !item.resolved && item.undoUntil !== null && item.undoUntil > ctx.now;
  const guide = guideArt(typeof item.data['guide'] === 'string' ? item.data['guide'] : null);
  const lead =
    item.source === 'guide' || item.actorId === null ? (
      <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={32} />
    ) : (
      <Avatar
        name={item.actorName}
        color={memberAccent(theme, SLOTS[item.actorJoinIndex % SLOTS.length])}
        size={32}
      />
    );
  const spoken = item.read ? line : t({ id: 'home.inbox.unreadSpoken', message: `New: ${line}` });
  const content = (
    <>
      {lead}
      <Text
        variant="rowText"
        tone={item.read ? 'muted' : 'ink'}
        style={styles.line}
        numberOfLines={2}
      >
        {line}
      </Text>
      {item.read ? null : <View style={styles.dot} testID={`inbox-unread-${item.id}`} />}
    </>
  );
  return (
    <View style={styles.row}>
      {item.deepLink === null ? (
        <View
          style={styles.open}
          accessible
          accessibilityLabel={spoken}
          testID={`inbox-row-${item.id}`}
        >
          {content}
        </View>
      ) : (
        <PressableScale
          onPress={() => onOpen(item)}
          accessibilityLabel={spoken}
          style={styles.open}
          testID={`inbox-row-${item.id}`}
        >
          {content}
        </PressableScale>
      )}
      {canUndo && undo !== undefined ? (
        <PressableScale
          onPress={() => onUndo(item, undo)}
          accessibilityLabel={t({ id: 'home.inbox.undoSpoken', message: `Undo: ${line}` })}
          testID={`inbox-undo-${item.id}`}
        >
          <Text variant="pillSmall">
            {renderer.actionLabel?.(undo, item, ctx) ??
              t({ id: 'home.inbox.undoLabel', message: 'Undo' })}
          </Text>
        </PressableScale>
      ) : item.resolved ? (
        <Icon name="check" size={16} color={theme.color.status.booked.text} />
      ) : null}
      <Text variant="caption" tone="muted">
        {shortAge(item.createdAt, ctx.now)}
      </Text>
    </View>
  );
}
