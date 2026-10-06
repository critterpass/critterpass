/**
 * Something handed to the human ops desk (3k-10, truthful): a clinic call the desk makes with the
 * traveller, a message to a place or anything else. The card says what a person is doing and when,
 * never that it is done: "Ops desk is calling the clinic with you", "The desk has it. Someone picks
 * it up by 10:40." or, outside staffed hours, "The desk answers from 07:00 (SGT)." Insurance is
 * only ever offered for a clinic call, and only shared through the traveller's own tap.
 */
import { ALL_PARTNERS_OFF, supplierCopy, type RequestConciergeResult } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useSupplierCopy } from './copy';

/** What the card says, from the desk's answer to `request_concierge`. */
export type ConciergeState =
  /** Outside staffed hours: when the desk answers. */
  | 'closed'
  /** A clinic call, with a policy on file the traveller has not yet agreed to share. */
  | 'clinic_share'
  /** A clinic call whose insurance details already go with it. */
  | 'clinic_shared'
  /** A clinic call with no policy on file. */
  | 'clinic'
  /** A message to a place or anything else, picked up by a person. */
  | 'picked_up';

export function conciergeState(
  result: Pick<RequestConciergeResult, 'kind' | 'desk_open' | 'insurance'>,
): ConciergeState {
  if (!result.desk_open) return 'closed';
  if (result.kind !== 'clinic') return 'picked_up';
  if (result.insurance?.on_file !== true) return 'clinic';
  return result.insurance.consented ? 'clinic_shared' : 'clinic_share';
}

export interface ConciergeCardProps {
  readonly state: ConciergeState;
  /** The pick-up time on the desk's clock ("10:40"). */
  readonly dueBy: string;
  /** When the desk opens and its zone ("07:00", "SGT"). */
  readonly opens: { readonly at: string; readonly tz: string };
  /** Opens the insurance share sheet; the details leave only from there. */
  readonly onShareInsurance?: () => void;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['10'],
  },
}));

export function ConciergeCard(props: ConciergeCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const render = useSupplierCopy();
  const due = props.dueBy;
  const opensAt = props.opens.at;
  const tz = props.opens.tz;
  const line =
    props.state === 'closed'
      ? t({
          id: 'suppliers.concierge.closed',
          message: `The desk answers from ${opensAt} (${tz}).`,
        })
      : props.state === 'picked_up'
        ? t({
            id: 'suppliers.concierge.pickedUp',
            message: `The desk has it. Someone picks it up by ${due}.`,
          })
        : props.state === 'clinic_share'
          ? render(supplierCopy({ action: 'clinic' }, ALL_PARTNERS_OFF))
          : t({
              id: 'suppliers.concierge.calling',
              message: 'Ops desk is calling the clinic with you.',
            });
  return (
    <Stack style={styles.card} testID={props.testID ?? `concierge-${props.state}`}>
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {t({ id: 'suppliers.concierge.eyebrow', message: 'Ops desk' })}
      </Text>
      <Text variant="rowTitle" testID="concierge-line">
        {line}
      </Text>
      {props.state === 'clinic_shared' ? (
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {t({
            id: 'suppliers.concierge.insuranceShared',
            message: 'Your insurance details go with the call.',
          })}
        </Text>
      ) : null}
      {props.state === 'clinic_share' && props.onShareInsurance ? (
        <PillButton
          size="sm"
          label={t({ id: 'suppliers.concierge.share', message: 'Share insurance details' })}
          onPress={props.onShareInsurance}
          loading={props.busy ?? false}
          testID="concierge-share-insurance"
        />
      ) : null}
      {props.error ? (
        <Text variant="caption" color={theme.semantic.state.urgent}>
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
