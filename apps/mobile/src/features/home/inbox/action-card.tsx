/**
 * One needs-you card (3b-4): a 40 pt tile in the kind's colour (the guide's sticker for guide
 * items), the title and live body, and the inline answers. Answered, it pops, slides off to the
 * right with a 4° turn and its row collapses (a fade under reduced motion). A card that expired
 * while on screen stays, reads as closed and offers nothing to press.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import type { InboxAction } from '@cp/domain';

import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction, type InlineActionKind } from '@/ui/buttons/InlineAction';
import { ActionCard } from '@/ui/cards/ActionCard';
import { cardBackground } from '@/ui/cards/tone';
import { Icon } from '@/ui/icons/Icon';
import { Sticker } from '@/ui/sticker/Sticker';
import { makeStyles, useTheme } from '@/ui/theme';

import { guideOr } from '../format';
import type { InboxItem } from './inbox-data';
import type { InboxRenderContext, InboxRenderer } from './kind-renderers';

const TILE = 40;
const TILE_ICON = 26;

const useStyles = makeStyles((t) => ({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface InboxActionCardProps {
  readonly item: InboxItem;
  readonly renderer: InboxRenderer;
  readonly ctx: InboxRenderContext;
  readonly expired: boolean;
  readonly handled: boolean;
  readonly onAction: (item: InboxItem, action: InboxAction) => void;
  readonly onDismissed: (item: InboxItem) => void;
}

function kindOf(action: InboxAction, primary: InlineActionKind): InlineActionKind {
  if (action.style === 'secondary') return 'ghost';
  return primary;
}

export function InboxActionCard({
  item,
  renderer,
  ctx,
  expired,
  handled,
  onAction,
  onDismissed,
}: InboxActionCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const copy = renderer.card?.(item, ctx) ?? { title: renderer.line(item, ctx) };
  const guide = guideOr(typeof item.data['guide'] === 'string' ? item.data['guide'] : null);
  const sticker = guideSticker(guide);
  const tone = renderer.tone ?? 'blue';
  const primary: InlineActionKind = tone === 'orange' ? 'nudge' : 'choice';
  const leading = (
    <View
      style={[
        styles.tile,
        { backgroundColor: cardBackground(theme, item.source === 'guide' ? 'yellow' : tone) },
      ]}
    >
      {item.source === 'guide' ? (
        <Sticker kind={sticker.kind} name={sticker.name} size={TILE_ICON + 6} />
      ) : (
        <Icon
          name={renderer.icon ?? 'spark'}
          size={TILE_ICON}
          color={theme.semantic.text.onAccent}
          decorative
        />
      )}
    </View>
  );
  const body = expired
    ? t({ id: 'home.inbox.closed', message: 'This one has closed.' })
    : copy.body;
  return (
    <ActionCard
      testID={`inbox-card-${item.id}`}
      title={copy.title}
      {...(body === undefined ? {} : { body })}
      leading={leading}
      handled={handled}
      onDismissed={() => onDismissed(item)}
      actions={
        expired ? null : (
          <>
            {item.actions.map((action) => (
              <InlineAction
                key={action.id}
                testID={`inbox-action-${item.id}-${action.id}`}
                label={
                  renderer.actionLabel?.(action, item, ctx) ??
                  // A nudge reads the same on every card that offers one.
                  (action.command === 'send_nudge'
                    ? t({ id: 'home.inbox.action.nudge', message: 'Nudge' })
                    : action.id)
                }
                kind={kindOf(action, primary)}
                selected={action.style === 'primary'}
                disabled={handled}
                onPress={() => onAction(item, action)}
              />
            ))}
          </>
        )
      }
    />
  );
}
