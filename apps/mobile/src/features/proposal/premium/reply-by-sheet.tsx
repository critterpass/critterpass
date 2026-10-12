/**
 * The reply-by picker in the premium look: the evenings the crew can still answer by, none after
 * the earliest free cancellation of a booked stay and none after the trip starts; the first row
 * keeps the guide's own pick. Undesigned in the premium set; built from the kit's sheet
 * (docs/undesigned-states.md).
 */
import { useLingui } from '@lingui/react/macro';

import { PremiumSheet } from '@/features/album';
import { Icon, ListCard, Row, Text, usePremiumTheme } from '@/ui/premium';

import type { ReplyBySheetProps } from '../builder/reply-by-sheet';
import { instantDate, instantDateTime } from '../data/format';

export function PremiumReplyBySheet(props: ReplyBySheetProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { locale } = props;
  const check = <Icon name="check" size={18} color={th.color.ink} />;
  return (
    <PremiumSheet
      title={t({ id: 'proposal.replyBy.title', message: 'Reply by' })}
      onClose={props.onClose}
      testID="reply-by-sheet"
    >
      <Text variant="body" tone="muted">
        {props.freeCancelUntil === null
          ? t({
              id: 'proposal.replyBy.whyStart',
              message: 'The crew answers before the trip starts.',
            })
          : t({
              id: 'proposal.replyBy.whyCancel',
              message: `Free cancellation on your stay ends ${instantDate(locale, props.freeCancelUntil)}, so the crew answers before then.`,
            })}
      </Text>
      <ListCard testID="reply-by-options">
        <Row
          title={
            props.fallback === null
              ? t({ id: 'proposal.replyBy.auto', message: 'Let the guide pick' })
              : t({
                  id: 'proposal.replyBy.autoAt',
                  message: `Guide’s pick · ${instantDateTime(locale, props.fallback.toISOString())}`,
                })
          }
          trailing={props.value === null ? check : undefined}
          onPress={() => props.onPick(null)}
        />
        {props.choices.map((at) => (
          <Row
            key={at.toISOString()}
            title={instantDateTime(locale, at.toISOString())}
            trailing={
              props.value !== null && new Date(props.value).getTime() === at.getTime()
                ? check
                : undefined
            }
            onPress={() => props.onPick(at.toISOString())}
          />
        ))}
      </ListCard>
    </PremiumSheet>
  );
}
