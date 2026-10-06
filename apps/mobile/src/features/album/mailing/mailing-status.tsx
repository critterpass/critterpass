/**
 * A printed mailing's progress (undesigned; built from list rows): one row per recipient with how
 * far their card got (ordered, sent to print, printed, on its way, or failed and refunded) and
 * when it should arrive. Crew without a saved address were asked to add one; crew in a country the
 * printer does not reach get the digital postcard only. Addresses never show here.
 */
import { postcardMailingTrackingSchema, type PostcardMailingStatus } from '@cp/domain';
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { ListCard } from '@/ui/cards/ListCard';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

export interface MailingRow {
  readonly status: PostcardMailingStatus;
  readonly recipientIds: readonly string[];
  readonly tracking: unknown;
}

export interface MailingNotice {
  readonly missing: readonly string[];
  readonly unsupported: readonly string[];
}

function statusLine(status: PostcardMailingStatus): string {
  switch (status) {
    case 'queued':
      return t({ id: 'album.mail.status.queued', message: 'Ordered' });
    case 'sent':
      return t({ id: 'album.mail.status.sent', message: 'At the printer' });
    case 'printed':
      return t({ id: 'album.mail.status.printed', message: 'Printed' });
    case 'shipped':
      return t({ id: 'album.mail.status.shipped', message: 'In the post' });
    case 'failed':
      return t({
        id: 'album.mail.status.failed',
        message: "Couldn't be printed. Your mailing for this trip is free again",
      });
  }
}

export function MailingStatus({
  mailing,
  notice,
  nameOf,
}: {
  readonly mailing: MailingRow | null;
  readonly notice: MailingNotice | null;
  readonly nameOf: (uid: string) => string;
}) {
  const locale = useLocale();
  const parsed = postcardMailingTrackingSchema.safeParse(mailing?.tracking ?? {});
  const orders = parsed.success ? parsed.data.orders : {};
  if (mailing === null && notice === null) return null;
  return (
    <Stack gap="8" testID="postcard-mailing">
      <Text variant="eyebrow">{t({ id: 'album.mail.title', message: 'Printed postcards' })}</Text>
      {mailing?.recipientIds.map((uid) => {
        const order = orders[uid];
        const status = order?.status ?? mailing.status;
        const eta = order?.eta;
        const progress = statusLine(status);
        const arrives =
          eta === undefined
            ? ''
            : format.date(locale, new Date(eta), { month: 'short', day: 'numeric' });
        return (
          <ListCard
            key={uid}
            title={nameOf(uid)}
            subtitle={
              eta === undefined || status === 'failed'
                ? progress
                : t({
                    id: 'album.mail.status.eta',
                    message: `${progress} · arrives around ${arrives}`,
                  })
            }
            chevron={false}
            testID={`postcard-mailing-${uid}`}
          />
        );
      })}
      {notice?.missing.map((uid) => (
        <ListCard
          key={uid}
          title={nameOf(uid)}
          subtitle={t({
            id: 'album.mail.missing',
            message: 'We asked them to add an address. Theirs goes out once they do',
          })}
          chevron={false}
        />
      ))}
      {notice?.unsupported.map((uid) => (
        <ListCard
          key={uid}
          title={nameOf(uid)}
          subtitle={t({
            id: 'album.mail.unsupported',
            message: "The printer doesn't post to their country yet, so they get the digital one",
          })}
          chevron={false}
        />
      ))}
    </Stack>
  );
}
