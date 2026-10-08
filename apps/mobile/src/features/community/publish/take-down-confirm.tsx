/**
 * The confirm step before a shared plan is taken down or one of its links switched off: each ends
 * something other people can see, so none acts on one tap.
 */
import { useLingui } from '@lingui/react/macro';

import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

export type Confirming =
  | { readonly kind: 'unpublish' }
  | { readonly kind: 'withdraw' }
  | { readonly kind: 'revoke'; readonly linkId: string; readonly made: string };

/** "12 Oct": the day a read-only link was made, to tell two links apart. */
export function linkDate(createdAt: string, locale: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
}

export function ConfirmTakeDown({
  confirming,
  onConfirm,
  onCancel,
}: {
  readonly confirming: Confirming;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useLingui();
  if (confirming.kind === 'revoke') {
    const made = confirming.made;
    return (
      <ConfirmSheet
        title={t({ id: 'community.revoke.title', message: `Turn off the link made ${made}?` })}
        consequences={[
          t({
            id: 'community.revoke.line',
            message: 'Anyone who has it sees "no longer shared". You can make a new link any time.',
          }),
        ]}
        confirmLabel={t({ id: 'community.revoke.confirm', message: 'Turn it off' })}
        mode="button"
        onCancel={onCancel}
        onConfirm={onConfirm}
        testID="share-plan-revoke-confirm"
      />
    );
  }
  const mine = confirming.kind === 'withdraw';
  return (
    <ConfirmSheet
      title={
        mine
          ? t({ id: 'community.withdraw.title', message: 'Take your yes back?' })
          : t({ id: 'community.unpublish.title', message: 'Unpublish this plan?' })
      }
      consequences={[
        t({
          id: 'community.unpublish.line',
          message: 'The plan comes down from crew plans, with its saves and rating.',
        }),
      ]}
      confirmLabel={
        mine
          ? t({ id: 'community.withdraw.confirm', message: 'Take it down' })
          : t({ id: 'community.published.unpublish', message: 'Unpublish' })
      }
      mode="button"
      onCancel={onCancel}
      onConfirm={onConfirm}
      testID="share-plan-unpublish-confirm"
    />
  );
}
