/**
 * One row of the quiet EARLIER list (3b-4): who (a crewmate's avatar, or the guide's sticker), the
 * line, UNDO while the guide's change can still be undone, a check once settled, and the age.
 * The row opens the item and UNDO sits beside it as its own button, not inside it: iOS folds a
 * button's children into one element, and VoiceOver could not reach a nested UNDO.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';

import type { InboxAction } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { Icon } from '@/ui/icons/Icon';
import { Avatar } from '@/ui/people/Avatar';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { guideOr, shortAge } from '../format';
import type { InboxItem } from './inbox-data';
import type { InboxRenderContext, InboxRenderer } from './kind-renderers';

const LEAD = 32;

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: MIN_TOUCH_TARGET + t.space['8'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    borderBottomWidth: 1,
    borderBottomColor: t.color.divider,
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  line: { flex: 1 },
  undo: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: t.space['4'] },
}));

export interface EarlierRowProps {
  readonly item: InboxItem;
  readonly renderer: InboxRenderer;
  readonly ctx: InboxRenderContext;
  readonly onUndo: (item: InboxItem, action: InboxAction) => void;
  readonly onOpen: (item: InboxItem) => void;
}

export function EarlierRow({ item, renderer, ctx, onUndo, onOpen }: EarlierRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const line = renderer.line(item, ctx);
  const undo = item.actions.find((action) => action.style === 'undo');
  const canUndo =
    undo !== undefined && !item.resolved && item.undoUntil !== null && item.undoUntil > ctx.now;
  const guide = guideSticker(
    guideOr(typeof item.data['guide'] === 'string' ? item.data['guide'] : null),
  );
  const lead =
    item.source === 'guide' || item.actorId === null ? (
      <Sticker kind={guide.kind} name={guide.name} size={LEAD} />
    ) : (
      <Avatar name={item.actorName} joinIndex={item.actorJoinIndex} size="lg" decorative />
    );
  return (
    <View style={styles.row}>
      <Pressable
        testID={`inbox-row-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={line}
        onPress={() => onOpen(item)}
        style={styles.open}
      >
        <View>{lead}</View>
        <Text variant="body" style={styles.line} numberOfLines={2}>
          {line}
        </Text>
      </Pressable>
      {canUndo ? (
        <Pressable
          testID={`inbox-undo-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'home.inbox.undoSpoken', message: `Undo: ${line}` })}
          onPress={() => onUndo(item, undo)}
          style={styles.undo}
        >
          <Text variant="label" color={theme.semantic.action.primary}>
            {upper(
              renderer.actionLabel?.(undo, item, ctx) ??
                t({ id: 'home.inbox.undoLabel', message: 'Undo' }),
              locale,
            )}
          </Text>
        </Pressable>
      ) : item.resolved ? (
        <Icon name="check" size={18} color={theme.semantic.state.success} decorative />
      ) : null}
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {shortAge(item.createdAt, ctx.now)}
      </Text>
    </View>
  );
}
