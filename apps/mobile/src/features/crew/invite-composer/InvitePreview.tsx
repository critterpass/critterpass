/** The ticket the invited friend will see, previewed on the invite screen. */
import { t } from '@lingui/core/macro';

import { upper } from '@cp/i18n';

import { Ticket } from '@/ui/documents/Ticket';

export function InvitePreview({
  locale,
  crewName,
  invitee,
  place,
}: {
  readonly locale: string;
  readonly crewName: string;
  /** The named friend; empty for a link anyone in the crew's circle can use. */
  readonly invitee: string;
  readonly place: string | null;
}) {
  return (
    <Ticket
      kind="crew"
      headStart={upper(t({ id: 'crew.composer.previewHead', message: 'They’ll see' }), locale)}
      headEnd={upper(crewName, locale)}
      from={{
        code: upper(
          invitee === '' ? t({ id: 'crew.composer.you', message: 'You' }) : invitee.slice(0, 8),
          locale,
        ),
      }}
      to={{ code: upper((place ?? crewName).replace(/\s+/gu, '').slice(0, 3), locale) }}
      fields={[
        {
          key: 'crew',
          label: t({ id: 'crew.composer.previewCrew', message: 'Crew' }),
          value: crewName,
        },
      ]}
      stubText={
        invitee === ''
          ? t({ id: 'crew.composer.previewGeneric', message: 'A seat in the crew' })
          : t({ id: 'crew.composer.previewNamed', message: `A seat for ${invitee}` })
      }
      accessibilityLabel={t({
        id: 'crew.composer.previewA11y',
        message: 'Preview of the invite ticket',
      })}
      testID="composer-preview"
    />
  );
}
